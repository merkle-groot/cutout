# Circuit Bug Fixes — Found During Testing

Three defects surfaced while building the test suite (see `TESTING_PROGRESS.md`).
Two were production-critical. Details, root causes, and fixes below.

---

## 1. `commitmentL2Sender` — ~34% of sends were unprovable

**Severity:** liveness / availability (not a soundness break, but a showstopper).

### Symptom
For roughly one in three shared secrets, witness generation aborted with an
assertion failure inside `Num2Bits`, so the sender could never produce a proof.
It was intermittent and input-dependent, which is exactly the kind of bug that
slips through a single happy-path test.

### Root cause
The circuit derives the one-time owner key `P = B + Poseidon(ss)·G`. The tweak
`Poseidon(ss)·G` was computed with circomlib's `BabyPbk()`, which internally does:

```
component pvkBits = Num2Bits(253);   // asserts input < 2^253
component mulFix  = EscalarMulFix(253, BASE8);
```

`BabyPbk` is built for **private keys**, which are expected to be `< L`
(the Baby Jubjub subgroup order, `≈ 2^251`), so 253 bits is plenty. But the tweak
scalar here is a **Poseidon hash output**, uniform over the whole scalar field
`[0, p)` where:

```
p       = 21888242871839275222246405745257275088548364400416034343698204186575808495617
2^253   < p < 2^254        (p is a 254-bit number)
```

So a Poseidon output lands in `[2^253, p)` with probability
`(p − 2^253) / p = 33.87%`. Every such value violates `Num2Bits(253)`'s
`in < 2^253` constraint → **~34% of all sends fail to prove.**

### Fix
Replace `BabyPbk` with a full-width fixed-base multiplication that accepts any
field element (`Num2Bits(254)` never asserts, since `p < 2^254`):

```circom
var BASE8[2] = [ 5299619240641551281634865583518297030282874472190772894086521144482721001553,
                 16950150798460657717958625567821834550301663161624707787222815936182638968203 ];
component tweakBits = Num2Bits(254);
tweakBits.in <== ssHasher.out;              // Poseidon(ss)
component tweakMul = EscalarMulFix(254, BASE8);
for (var i = 0; i < 254; i++) tweakMul.e[i] <== tweakBits.out[i];
// P = B + tweak
```

### Why this stays consistent with the recipient
The recipient derives `sk = (b + Poseidon(ss)) mod L` and `P = sk·G`. The sender
now computes `B + Poseidon(ss)·G` with the *unreduced* `Poseidon(ss)`. These are
equal as group elements regardless of reduction, because scalar multiplication is
inherently mod `L`:
`(b + Poseidon(ss))·G = b·G + Poseidon(ss)·G = B + Poseidon(ss)·G`.
The recipient side (`commitmentL2Withdraw`) never had this bug — its scalar is
already reduced (`< L < 2^253`), so `BabyPbk` is safe there.

### How it was caught
`tests/commitmentL2.test.ts` T1.2 loops over several `ssX` values; one produced a
`Poseidon(ss) ≥ 2^253` and the witness asserted. A single fixed vector would have
passed ~2/3 of the time and hidden it.

---

## 2. `commitmentL2Withdraw` — L2 nullifier double-spend

**Severity:** critical soundness / loss of funds.

### Symptom
The same note could be spent more than once. Each spend would emit a *different*
nullifier, so the pool's spent-set never recognised the second spend.

### Root cause
An earlier "improvement" bound the nullifier to the leaf's tree index:

```circom
nullifierHash = Poseidon(stealthPrivateKey, leafIndex);   // leafIndex = stateIndex
```

`leafIndex` was the `@zk-kit/lean-imt` proof index, which the circuit also uses
for the Merkle inclusion path. **In a LeanIMT the path index of a fixed leaf is
not stable — it changes as the tree grows** (LeanIMT has dynamic depth; when the
depth increases, the leaf's left/right decisions relative to the moving root
change). Measured directly for one leaf:

```
3 leaves: proof(2).index = 1
4 leaves: proof(2).index = 2
6 leaves: proof(2).index = 2
```

So `Poseidon(sk, leafIndex)` yields a *different* valid nullifier depending on the
tree size at spend time. An attacker spends the note when the tree is small
(nullifier `N1` recorded), then spends the **same** note after the tree grows
(nullifier `N2 ≠ N1`, not in the spent set) → accepted → the pool pays twice for
one note.

### Fix
Revert to binding the nullifier to the **commitment**, which is
position-independent:

```circom
nullifierHash = Poseidon(stealthPrivateKey, commitmentHasher.out);
```

`commitment = Poseidon(P.x, P.y, value, r)` does not depend on tree position, is
unique per distinct note, and is recomputed and proven-included inside the
circuit — so the nullifier is deterministic per note regardless of tree state.
The `leafIndex` input was removed from `commitmentL2Withdraw` and its wiring in
`withdrawL2`.

### On the trade-off (why the earlier change was wrong)
`leafIndex` had been added to disambiguate byte-identical duplicate notes (same
`sk`, `value`, `r`). But commitment-binding already distinguishes every realistic
case — including `ss` reuse with a *different* value, since `value` is in the
commitment. The only residual collision is a truly byte-identical note (sender
reuses the ephemeral `e` **and** the value), which is a sender-side self-grief,
not a soundness break. Trading that narrow edge for a tree-growth double-spend was
a strictly bad exchange.

### How it was caught
`tests/e2e.test.ts` T4.1 runs the full Mode-3 flow: it inserts `C_dest` at a real
tree position and has the recipient derive the spend independently. The circuit's
nullifier didn't match `Poseidon(sk, index)` (index 2 vs proof index 1), which
led to measuring the index instability above. This is the payoff of testing the
whole flow rather than each circuit in isolation.

---

## 3. `commitmentL2Withdraw` — dead `ssHasher` component

**Severity:** cleanliness / efficiency (no correctness impact).

### Symptom
`circom --inspect` printed a `CA02` warning during Groth16 setup:
`ssHasher.out does not appear in any constraint of the father component`.

### Root cause
After fix #2 reverted the nullifier, a leftover component was orphaned:

```circom
component ssHasher = Poseidon(1);
ssHasher.inputs[0] <== sharedSecretX;   // output never read
```

Nothing consumed `ssHasher.out`: the blinding uses `Poseidon(sharedSecretX, 1)`
directly, the owner key comes from `stealthPrivateKey`, and the nullifier now uses
the commitment. (In `commitmentL2Sender` the equivalent `ssHasher` *is* needed —
for the tweak and the view tag — so this only applied to the withdraw circuit.)

### Why it matters
Not a soundness issue, but it (a) added an unnecessary Poseidon hash worth of
constraints to every L2 spend (larger zkey, slower proving), and (b) a dangling
unconstrained signal is a smell that can mask genuine under-constraint bugs, which
hurts auditability.

### Fix
Removed the component. All 38 tests remain green and the constraint count dropped.

---

## Validation
- `npx mocha` → 36 witness-level tests passing.
- `npx mocha tests/proving.test.ts` → 2 Groth16 prove/verify tests passing
  (incl. a tampered-public-signal rejection).
- `yarn compile` → all 6 circuits compile.
