import assert from "node:assert/strict";
import test from "node:test";
import { SPENT_STATUS, largestFirst, matchingNotes, newestFirst, noteCreatedAt, spentLast } from "./note-order.js";

const ids = (notes) => notes.map((note) => note.id);

test("spentLast moves spent notes below live ones", () => {
  const notes = [
    { id: "a", status: "spent" },
    { id: "b", status: "ready" },
    { id: "c", status: "spent" },
    { id: "d", status: "pending" },
  ];
  assert.deepEqual(ids(spentLast(notes, SPENT_STATUS.l1)), ["b", "d", "a", "c"]);
});

test("spentLast is stable within each group", () => {
  const notes = [
    { id: "1", status: "ready" },
    { id: "2", status: "ready" },
    { id: "3", status: "spent" },
    { id: "4", status: "spent" },
  ];
  assert.deepEqual(ids(spentLast(notes, SPENT_STATUS.l1)), ["1", "2", "3", "4"]);
});

test("spentLast uses the route's own spent status", () => {
  // An L2 note is finished at `withdrawn`, not `spent`.
  const notes = [{ id: "x", status: "withdrawn" }, { id: "y", status: "spendable" }];
  assert.deepEqual(ids(spentLast(notes, SPENT_STATUS.l2)), ["y", "x"]);
  // Read with the L1 status, nothing looks spent and the order is untouched.
  assert.deepEqual(ids(spentLast(notes, SPENT_STATUS.l1)), ["x", "y"]);
});

test("spentLast leaves an all-live or empty list alone", () => {
  assert.deepEqual(spentLast([], SPENT_STATUS.l1), []);
  const live = [{ id: "a", status: "ready" }, { id: "b", status: "ready" }];
  assert.deepEqual(ids(spentLast(live, SPENT_STATUS.l1)), ["a", "b"]);
});

test("noteCreatedAt reads whichever timestamp the note carries", () => {
  assert.equal(noteCreatedAt({ depositedAt: 5 }), 5);
  assert.equal(noteCreatedAt({ changeAt: 6 }), 6);
  assert.equal(noteCreatedAt({ bridgedAt: 7 }), 7);
  assert.equal(noteCreatedAt({ at: 8 }), 8);
  assert.equal(noteCreatedAt({}), null);
});

test("newestFirst puts the most recent note at the top", () => {
  const notes = [{ id: "old", depositedAt: 100 }, { id: "new", depositedAt: 300 }, { id: "mid", depositedAt: 200 }];
  assert.deepEqual(ids(newestFirst(notes)), ["new", "mid", "old"]);
});

test("newestFirst sinks undated notes below every dated one", () => {
  // A note recovered from chain events has no local timestamp. Floating it to
  // the top would rank what the vault knows least about above a fresh deposit.
  const notes = [{ id: "unknown" }, { id: "dated", depositedAt: 1 }];
  assert.deepEqual(ids(newestFirst(notes)), ["dated", "unknown"]);
});

test("newestFirst is stable for notes sharing a timestamp", () => {
  const notes = [{ id: "a", depositedAt: 5 }, { id: "b", depositedAt: 5 }, { id: "c" }, { id: "d" }];
  assert.deepEqual(ids(newestFirst(notes)), ["a", "b", "c", "d"]);
});

test("newestFirst does not mutate its input", () => {
  const notes = [{ id: "a", depositedAt: 1 }, { id: "b", depositedAt: 2 }];
  newestFirst(notes);
  assert.deepEqual(ids(notes), ["a", "b"]);
});

test("spentLast over newestFirst leaves each group newest-first", () => {
  const notes = [
    { id: "old-live", status: "ready", depositedAt: 100 },
    { id: "new-spent", status: "spent", depositedAt: 400 },
    { id: "new-live", status: "ready", depositedAt: 300 },
    { id: "old-spent", status: "spent", depositedAt: 200 },
  ];
  assert.deepEqual(
    ids(spentLast(newestFirst(notes), SPENT_STATUS.l1)),
    ["new-live", "old-live", "new-spent", "old-spent"],
  );
});

test("largestFirst orders by value, not by string or float", () => {
  // Above 2^53 a Number comparison starts losing digits; these two differ only in
  // the last place and must still sort correctly.
  const notes = [
    { value: "9007199254740993000000000000000000" },
    { value: "9007199254740992000000000000000000" },
    { value: "1" },
  ];
  assert.deepEqual(largestFirst(notes).map((n) => n.value), [
    "9007199254740993000000000000000000",
    "9007199254740992000000000000000000",
    "1",
  ]);
});

test("largestFirst leaves the input array alone", () => {
  const notes = [{ value: "1" }, { value: "9" }];
  largestFirst(notes);
  assert.deepEqual(notes.map((n) => n.value), ["1", "9"]);
});

test("matchingNotes ANDs every term so typing narrows", () => {
  const notes = [
    { name: "brave otter", value: "0.1" },
    { name: "brave lynx", value: "0.5" },
  ];
  const describe = (n) => [n.name, n.value];
  assert.equal(matchingNotes(notes, "brave", describe).length, 2);
  assert.equal(matchingNotes(notes, "brave otter", describe).length, 1);
  assert.equal(matchingNotes(notes, "brave 0.5", describe).length, 1);
  assert.equal(matchingNotes(notes, "brave walrus", describe).length, 0);
});

test("matchingNotes is case-insensitive and ignores surrounding space", () => {
  const notes = [{ name: "Brave Otter" }];
  assert.equal(matchingNotes(notes, "  bRaVe   OTTER ", (n) => [n.name]).length, 1);
});

test("an empty search shows every note rather than none", () => {
  const notes = [{ name: "a" }, { name: "b" }];
  for (const query of ["", "   ", null, undefined]) {
    assert.equal(matchingNotes(notes, query, (n) => [n.name]).length, 2);
  }
});
