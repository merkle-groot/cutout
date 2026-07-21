/**
 * Reconstructing L1 change notes — the leftover from a partial bridge
 * withdrawal — after a wiped browser, and deriving the index a new one takes.
 *
 * A deposit's identifying hash (`precommitment = Poseidon(nullifier, secret)`)
 * is published at CREATION time in the `Deposited` event, independent of value,
 * which is what lets `recoverNotes` (packages/sdk/src/identity.ts) walk indices
 * and match blind. A change note has no such event: `withdrawL1.circom` computes
 * `Poseidon(newNullifier, newSecret)` but discards it (`_ <==
 * changeCommitmentHasher.nullifierHash`) and only ever exposes the
 * value-dependent `newCommitmentHashL1 = Poseidon(remainingValue, label,
 * Poseidon(newNullifier, newSecret))`. So a change note cannot be found by a
 * blind index walk the way a deposit can — reproducing its commitment needs the
 * `remainingValue`, and that is only knowable once its PARENT is known.
 *
 * What makes that tractable is that the notes under one label form a strictly
 * linear chain. `State.sol`'s `_spend` reverts on a reused nullifier hash, so a
 * note is spendable at most once, so it has at most one `Withdrawn` event, so it
 * leaves at most one change note:
 *
 *     deposit d(scope,0) --Withdrawn--> w(label,0) --Withdrawn--> w(label,1) --> …
 *
 * The withdrawal index is therefore not a value to be searched for at all — it
 * IS the note's depth in that chain, counted from 0 at the deposit. Both halves
 * below are just that one fact read in opposite directions: recovery counts hops
 * as it walks, creation adds one to its parent. Nothing probes, so nothing needs
 * a ceiling, and 10,000 partial withdrawals recover exactly as well as one.
 *
 * `deriveSecrets`/`commitmentHash`/`nullifierHash` are injected everywhere below
 * so this module stays free of the SDK's Poseidon/HD dependencies and is cheap
 * to unit test; callers wire them to `generateWithdrawalSecrets`, `getCommitment`,
 * and the L1 nullifier-hash function respectively.
 */

/**
 * The withdrawal index a note's change note will take.
 *
 * Deposits and change notes count in DIFFERENT namespaces — `generateDepositSecrets`
 * is keyed by scope, `generateWithdrawalSecrets` by label — so a deposit's own
 * index says nothing about where the label's withdrawal chain starts. It always
 * starts at 0. Reading `parent.withdrawalIndex` (absent on deposits) rather than
 * the overloaded `parent.index` is what keeps the two counters from being mixed:
 * spending deposit #7 must produce change note 0, not change note 8, or creation
 * and recovery derive different secrets and the note is lost.
 */
export function nextWithdrawalIndex(parent) {
  return parent?.withdrawalIndex === undefined || parent.withdrawalIndex === null
    ? 0n
    : BigInt(parent.withdrawalIndex) + 1n;
}

/**
 * Rebuild the change notes left behind by every partial withdrawal in a chain,
 * recursively — a change note carries its parent's label
 * (withdrawL1.circom §114), so it can itself be partially withdrawn again under
 * that SAME label, one hop further down.
 *
 * `notes` (already-known: recovered deposits, legacy notes) is the search seed,
 * not part of the output — this returns only the NEWLY reconstructed notes.
 *
 * The derived commitment is checked against the one the chain actually emitted
 * rather than trusted: a mismatch means this vault's secrets do not open that
 * note, and recording it anyway would put a note in the vault that can never be
 * spent. Walking on instead of throwing keeps one unopenable chain from taking
 * the other chains' recovery down with it.
 */
export function recoverChangeNotes({ notes, withdrawals, deriveSecrets, commitmentHash, nullifierHash }) {
  const byNullifierHash = new Map(withdrawals.map((w) => [w.spentNullifierHash, w]));
  const found = [];
  const queue = notes.map((note) => ({ note, withdrawalIndex: nextWithdrawalIndex(note) }));

  while (queue.length) {
    const { note, withdrawalIndex } = queue.shift();
    const withdrawal = byNullifierHash.get(nullifierHash(note.nullifier));
    if (!withdrawal) continue; // never spent, so it left no change note

    const remainingValue = note.value - withdrawal.withdrawnValue;
    if (remainingValue <= 0n) continue; // a full withdrawal leaves nothing worth recovering

    const { nullifier, secret } = deriveSecrets(note.label, withdrawalIndex);
    if (commitmentHash(remainingValue, note.label, nullifier, secret) !== withdrawal.newCommitment) continue;

    const child = {
      withdrawalIndex,
      commitment: withdrawal.newCommitment,
      label: note.label,
      value: remainingValue,
      nullifier,
      secret,
      changeFrom: note.commitment,
    };
    found.push(child);
    queue.push({ note: child, withdrawalIndex: withdrawalIndex + 1n });
  }

  return found;
}
