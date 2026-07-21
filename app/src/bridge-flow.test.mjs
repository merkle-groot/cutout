import assert from "node:assert/strict";
import test from "node:test";
import { bridgedValueAfterFee, clampWithdrawAmount, relayFeeBpsFromQuote, remainingNoteValue, validateWithdrawAmount } from "./bridge-flow.js";

test("relayFeeBpsFromQuote prefers the raw bps field", () => {
  assert.equal(relayFeeBpsFromQuote({ bps: 30, feeBps: 0.3 }), 30n);
});

test("relayFeeBpsFromQuote falls back to the percent-shaped feeBps field", () => {
  // A server that has not restarted since `bps` was added serves only `feeBps`,
  // as a percent. Without this the fee preview never leaves "loading…".
  assert.equal(relayFeeBpsFromQuote({ feeBps: 0.3 }), 30n);
  assert.equal(relayFeeBpsFromQuote({ feeBps: 2.5 }), 250n);
});

test("relayFeeBpsFromQuote returns null when the quote is missing or unusable", () => {
  assert.equal(relayFeeBpsFromQuote(null), null);
  assert.equal(relayFeeBpsFromQuote({}), null);
  assert.equal(relayFeeBpsFromQuote({ feeBps: Number.NaN }), null);
});

test("validateWithdrawAmount rejects zero and negative amounts", () => {
  assert.match(validateWithdrawAmount(0n, 100n), /positive/);
  assert.match(validateWithdrawAmount(-1n, 100n), /positive/);
});

test("validateWithdrawAmount rejects an amount above the note's value", () => {
  assert.match(validateWithdrawAmount(101n, 100n), /note's value/);
});

test("validateWithdrawAmount accepts the full note value and anything below it", () => {
  assert.equal(validateWithdrawAmount(100n, 100n), null);
  assert.equal(validateWithdrawAmount(1n, 100n), null);
});

test("bridgedValueAfterFee cuts the fee from the withdrawn amount, not the full note", () => {
  // 1% of the withdrawn 1000, not 1% of some larger note the caller might hold.
  assert.equal(bridgedValueAfterFee(1000n, 100n), 990n);
});

test("bridgedValueAfterFee floors the same way Solidity integer division does", () => {
  assert.equal(bridgedValueAfterFee(999n, 100n), 990n); // 9.99 truncates to 9
});

test("remainingNoteValue is zero for a full withdrawal and positive for a partial one", () => {
  assert.equal(remainingNoteValue(100n, 100n), 0n);
  assert.equal(remainingNoteValue(100n, 40n), 60n);
});

test("clampWithdrawAmount caps a proposed withdrawal at the note's value", () => {
  assert.equal(clampWithdrawAmount(150n, 100n), 100n);
});

test("clampWithdrawAmount leaves an in-bounds amount unchanged", () => {
  assert.equal(clampWithdrawAmount(40n, 100n), 40n);
  assert.equal(clampWithdrawAmount(100n, 100n), 100n);
});
