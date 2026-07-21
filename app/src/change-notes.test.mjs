import assert from "node:assert/strict";
import test from "node:test";
import { nextWithdrawalIndex, recoverChangeNotes } from "./change-notes.js";

// A tiny deterministic stand-in for Poseidon. `recoverChangeNotes` never assumes
// anything about the hash beyond "same inputs, same output" — these fakes are
// intentionally nothing like the real curve.
const deriveSecrets = (label, index) => ({ nullifier: label * 1000n + index, secret: label * 1000n + index + 500n });
const commitmentHash = (value, label, nullifier, secret) => value * 1_000_000n + nullifier * 100n + secret;
const nullifierHash = (nullifier) => nullifier + 7n;

/** A `Withdrawn` event spending `note`, leaving `remaining` in a change note at `index`. */
function withdrawalOf(note, remaining, index) {
  const { nullifier, secret } = deriveSecrets(note.label, index);
  return {
    spentNullifierHash: nullifierHash(note.nullifier),
    withdrawnValue: note.value - remaining,
    newCommitment: commitmentHash(remaining, note.label, nullifier, secret),
  };
}

test("a deposit's change note starts the label's withdrawal chain at 0", () => {
  // Deposit derivation index and withdrawal index are different namespaces, so a
  // deposit's own index must not leak into the chain it starts.
  assert.equal(nextWithdrawalIndex({ index: "7" }), 0n);
  assert.equal(nextWithdrawalIndex({}), 0n);
  assert.equal(nextWithdrawalIndex(undefined), 0n);
});

test("a change note's own change note continues the chain", () => {
  assert.equal(nextWithdrawalIndex({ withdrawalIndex: "0" }), 1n);
  assert.equal(nextWithdrawalIndex({ withdrawalIndex: 4n }), 5n);
});

test("recoverChangeNotes reconstructs a single partial-withdrawal change note", () => {
  const label = 9n;
  const parent = { commitment: "parent", label, value: 100n, nullifier: 1n };
  const withdrawal = withdrawalOf(parent, 60n, 0n);
  const { nullifier, secret } = deriveSecrets(label, 0n);

  const found = recoverChangeNotes({ notes: [parent], withdrawals: [withdrawal], deriveSecrets, commitmentHash, nullifierHash });
  assert.deepEqual(found, [
    { withdrawalIndex: 0n, commitment: withdrawal.newCommitment, label, value: 60n, nullifier, secret, changeFrom: "parent" },
  ]);
});

test("recoverChangeNotes recurses into a change note's own later partial withdrawal", () => {
  const label = 9n;
  const parent = { commitment: "parent", label, value: 100n, nullifier: 1n };
  const first = withdrawalOf(parent, 60n, 0n);
  const child = { commitment: first.newCommitment, label, value: 60n, nullifier: deriveSecrets(label, 0n).nullifier };
  const second = withdrawalOf(child, 20n, 1n);

  const found = recoverChangeNotes({ notes: [parent], withdrawals: [first, second], deriveSecrets, commitmentHash, nullifierHash });
  assert.deepEqual(found.map((n) => [n.withdrawalIndex, n.value]), [[0n, 60n], [1n, 20n]]);
  assert.equal(found[1].changeFrom, first.newCommitment);
});

test("recoverChangeNotes walks a chain far past any former index ceiling", () => {
  // The regression this guards: while the index was SEARCHED rather than counted,
  // the walk stopped at a hard ceiling of 20 and silently dropped every note from
  // there on — reachable by nothing more exotic than using the feature 21 times.
  const label = 9n;
  const deposit = { commitment: "deposit", label, value: 10_000n, nullifier: 1n };

  const withdrawals = [];
  let note = deposit;
  for (let index = 0n; index < 50n; index += 1n) {
    const remaining = note.value - 1n;
    const withdrawal = withdrawalOf(note, remaining, index);
    withdrawals.push(withdrawal);
    note = { commitment: withdrawal.newCommitment, label, value: remaining, nullifier: deriveSecrets(label, index).nullifier };
  }

  const found = recoverChangeNotes({ notes: [deposit], withdrawals, deriveSecrets, commitmentHash, nullifierHash });
  assert.equal(found.length, 50);
  assert.equal(found[49].withdrawalIndex, 49n);
  assert.equal(found[49].value, 9_950n);
});

test("recoverChangeNotes skips a full withdrawal — nothing left to recover", () => {
  const label = 9n;
  const parent = { commitment: "parent", label, value: 100n, nullifier: 1n };
  const withdrawals = [{ spentNullifierHash: nullifierHash(1n), withdrawnValue: 100n, newCommitment: 0n }];
  assert.deepEqual(recoverChangeNotes({ notes: [parent], withdrawals, deriveSecrets, commitmentHash, nullifierHash }), []);
});

test("recoverChangeNotes ignores notes that were never spent", () => {
  const parent = { commitment: "parent", label: 9n, value: 100n, nullifier: 1n };
  assert.deepEqual(recoverChangeNotes({ notes: [parent], withdrawals: [], deriveSecrets, commitmentHash, nullifierHash }), []);
});

test("recoverChangeNotes drops a chain whose commitment its own secrets cannot reproduce", () => {
  // Someone else's withdrawal can burn a nullifier this vault knows only if the
  // vault is wrong about which note that is. Recording the change note anyway
  // would put an unspendable note in the vault.
  const label = 9n;
  const parent = { commitment: "parent", label, value: 100n, nullifier: 1n };
  const withdrawals = [{ spentNullifierHash: nullifierHash(1n), withdrawnValue: 40n, newCommitment: 123_456n }];
  assert.deepEqual(recoverChangeNotes({ notes: [parent], withdrawals, deriveSecrets, commitmentHash, nullifierHash }), []);
});
