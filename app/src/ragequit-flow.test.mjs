import assert from "node:assert/strict";
import test from "node:test";
import {
  RAGEQUIT_PATH,
  formatRagequitProof,
  hasRagequitConsent,
  partitionRagequitNotes,
  selectRagequitNote,
} from "./ragequit-flow.js";

test("ragequit has its own vault route", () => {
  assert.equal(RAGEQUIT_PATH, "/vault/ragequit");
});

test("only unspent notes owned by the connected on-chain depositor are eligible", () => {
  const notes = [
    { commitment: "1", status: "ready" },
    { commitment: "2", status: "ready" },
    { commitment: "3", status: "spent" },
    { commitment: "4", status: "ready" },
  ];
  const eligibility = {
    1: { depositor: "0xAa", spent: false },
    2: { depositor: "0xBb", spent: false },
    3: { depositor: "0xAa", spent: false },
    4: { depositor: "0xAa", spent: true },
  };

  const { eligible, mismatched } = partitionRagequitNotes(notes, eligibility, "0xaa");
  assert.deepEqual(eligible.map((note) => note.commitment), ["1"]);
  assert.deepEqual(mismatched.map((note) => note.commitment), ["2"]);
});

test("consent and a prepared proof cannot carry over to another note", () => {
  const ragequit = {
    noteCommitment: "1",
    confirmedCommitment: "1",
    proof: { commitment: "1" },
    response: { hash: "0x1" },
  };
  assert.equal(hasRagequitConsent(ragequit, "1"), true);

  selectRagequitNote(ragequit, "2");

  assert.equal(ragequit.noteCommitment, "2");
  assert.equal(hasRagequitConsent(ragequit, "2"), false);
  assert.equal(ragequit.proof, null);
  assert.equal(ragequit.response, null);
});

test("Groth16 proof formatting swaps each Solidity G2 coordinate pair", () => {
  const formatted = formatRagequitProof({
    proof: {
      pi_a: ["1", "2", "1"],
      pi_b: [["3", "4"], ["5", "6"], ["1", "0"]],
      pi_c: ["7", "8", "1"],
    },
    publicSignals: ["9", "10", "11", "12"],
  });

  assert.deepEqual(formatted, {
    pA: [1n, 2n],
    pB: [[4n, 3n], [6n, 5n]],
    pC: [7n, 8n],
    pubSignals: [9n, 10n, 11n, 12n],
  });
});
