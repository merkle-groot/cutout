# Circuit Testing — Reference Tasks

Canonical, stable list of tasks for testing the Cutout circuits. Do not edit task
IDs once assigned; track status in `TESTING_PROGRESS.md`.

## Phase 0 — Harness
- **T0.1** Baby Jubjub helper module (`buildBabyjub`, memoized): `derivePublicKey`, `computeSharedSecret`, `stealthPubKey`, `stealthPrivKey` (mod subgroup order L).
- **T0.2** L2 note helpers: `hashL2Commitment`, `viewTag` (low byte), `l2Nullifier`.
- **T0.3** Helper self-test: `stealthPubKey(B, ssX) === derivePublicKey(stealthPrivKey(b, ssX))`.
- **T0.4** Update `package.json` test scripts to new circuit file names.

## Phase 1 — Unit tests
- **T1.1** `commitmentL1`: commitment + nullifierHash vs reference; determinism.
- **T1.2** `commitmentL2Sender`: commitment + viewTag vs reference; view-tag low-byte boundary; field independence (value vs ssX).
- **T1.3** `commitmentL2Withdraw`: commitment + nullifier vs reference.
- **T1.4** ★ Round-trip: sender.commitment === withdraw.commitment for same (b, ssX, value).
- **T1.5** `commitmentL2Withdraw` nullifier: same sk, different leafIndex ⇒ different nullifier.
- **T1.6** `merkleTree`: keep existing lean-imt tests; add partial-depth root check.

## Phase 2 — Integration: withdrawL1
- **T2.1** Partial withdrawal expectPass (all 4 outputs).
- **T2.2** Conservation: withdrawn + change == existing.
- **T2.3** Full withdrawal (change value == 0).
- **T2.4** Value binding: C_dest value == public withdrawnValue.
- **T2.5** Negatives: not in state tree; label not in ASP; nullifier reuse; over-withdraw; invalid depth.

## Phase 3 — Integration: withdrawL2
- **T3.1** expectPass: nullifier == Poseidon(sk, stateIndex); inclusion holds.
- **T3.2** Negatives: wrong sk; wrong stateIndex; note absent; invalid depth.

## Phase 4 — End-to-end
- **T4.1** Full Mode-3 flow: deposit → withdrawL1 → insert C_dest on L2 → recipient scan (viewTag + v·E) → withdrawL2 spend.

## Phase 5 — Proving tier
- **T5.1** Full Groth16 setup/prove/verify for withdrawL1 & withdrawL2 (ptau 2^16).
