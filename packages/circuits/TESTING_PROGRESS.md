# Circuit Testing — Progress

Living status log. Completed tasks are struck through. See `TESTING_TASKS.md` for
the canonical task descriptions.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Phase 0 — Harness
- [x] ~~T0.1 Baby Jubjub helper module~~ (`tests/common/stealth.ts`)
- [x] ~~T0.2 L2 note helpers~~ (`tests/common/stealth.ts`)
- [x] ~~T0.3 Helper self-test~~ (`tests/stealth.test.ts`, 6 passing)
- [x] ~~T0.4 Update package.json test scripts~~ (positive spec per suite; stale `withdrawal.test.ts` → `.old`)

## Phase 1 — Unit tests
- [x] ~~T1.1 commitmentL1~~ (`tests/commitment.test.ts`, retargeted, 8 passing)
- [x] ~~T1.2 commitmentL2Sender~~ (`tests/commitmentL2.test.ts`)
- [x] ~~T1.3 commitmentL2Withdraw~~ (`tests/commitmentL2.test.ts`)
- [x] ~~T1.4 Round-trip sender↔withdraw~~ (`tests/commitmentL2.test.ts`)
- [x] ~~T1.5 L2 nullifier leafIndex binding~~ (`tests/commitmentL2.test.ts`)
- [x] ~~T1.6 merkleTree~~ (existing `tests/lean-imt.test.ts`, 2 passing)

## Phase 2 — withdrawL1
- [x] ~~T2.1 Partial withdrawal pass~~ (`tests/withdrawL1.test.ts`, 8 passing)
- [x] ~~T2.2 Conservation~~
- [x] ~~T2.3 Full withdrawal~~
- [x] ~~T2.4 Value binding~~
- [x] ~~T2.5 Negatives~~ (5 cases)

## Phase 3 — withdrawL2
- [x] ~~T3.1 Spend pass~~ (`tests/withdrawL2.test.ts`, 5 passing)
- [x] ~~T3.2 Negatives~~ (4 cases)

## Phase 4 — End-to-end
- [x] ~~T4.1 Full Mode-3 flow~~ (`tests/e2e.test.ts`, 1 passing)

## Phase 5 — Proving tier
- [x] ~~T5.1 Groth16 setup/prove/verify~~ (`tests/proving.test.ts`, 2 passing;
  ptau fetched to `ptau/powersOfTau28_hez_final_16.ptau`; `circuits.json` populated
  for `ProofTester`). Includes a tampered-public-signal rejection check.

---

### Log
- _(start)_ Files initialized; circuits compile via `yarn compile` (6 circuits green).
- Phase 0 harness done: `tests/common/stealth.ts` + `tests/stealth.test.ts` (6 passing).
- Phase 1 L2 units done: `tests/commitmentL2.test.ts` (6 passing).
- 🐛 **BUG FOUND & FIXED (commitmentL2Sender):** used `BabyPbk` (Num2Bits(253)) to
  multiply the tweak `Poseidon(ss)`, but a Poseidon output can be ≥ 2^253, so
  witness generation asserted for ~44% of shared secrets — nearly half of all
  sends unprovable. Replaced with a 254-bit `Num2Bits` + `EscalarMulFix(254, BASE8)`.
  Caught by the T1.2 low-byte loop test.
- **Milestone: Phases 0 + 1 complete — full suite 22 passing** (`npx mocha`).
- Phase 2 done: `tests/withdrawL1.test.ts` (8 passing).
- Phase 3 done: `tests/withdrawL2.test.ts` (5 passing).
- 🐛 **BUG FOUND & FIXED (L2 nullifier double-spend) — via the e2e test:** the
  nullifier had been bound to `leafIndex`, but `@zk-kit/lean-imt` proof index is
  the *path* index and **changes as the tree grows** (verified: same leaf 1→2→2).
  Binding it let the same note produce different valid nullifiers at different
  tree sizes → double-spend. Reverted to `Poseidon(sk, commitment)` (stable,
  position-independent). Removed `leafIndex` input from commitmentL2Withdraw and
  withdrawL2. NOTE: this reverses the earlier "T1.5 leafIndex" change — that was
  a regression; commitment-binding is the correct design.
- **Milestone: Phases 0–4 complete — full suite 36 passing; all 6 circuits compile.**
- Phase 5 done: `tests/proving.test.ts` (2 passing) — real Groth16 prove/verify.
- 🧹 Cleanup: removed dead `ssHasher` Poseidon from `commitmentL2Withdraw`
  (unused after the nullifier revert; flagged by a CA02 warning during setup).
- **✅ ALL PHASES COMPLETE — 38 tests passing total (36 witness + 2 proving).**
  Two production-critical bugs found & fixed along the way (sender scalar-range,
  L2 nullifier double-spend).
