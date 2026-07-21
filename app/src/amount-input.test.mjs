import assert from "node:assert/strict";
import test from "node:test";
import { amountAfterEdit, isAcceptableAmount, truncateAmount } from "./amount-input.js";

test("isAcceptableAmount allows ordinary decimals up to three places", () => {
  assert.ok(isAcceptableAmount("0"));
  assert.ok(isAcceptableAmount("1.5"));
  assert.ok(isAcceptableAmount("12.345"));
  assert.ok(isAcceptableAmount("1000"));
});

test("isAcceptableAmount allows intermediate states while typing", () => {
  // A user who has typed "0." is mid-edit, not wrong.
  assert.ok(isAcceptableAmount(""));
  assert.ok(isAcceptableAmount("0."));
});

test("isAcceptableAmount rejects a fourth decimal place", () => {
  assert.ok(!isAcceptableAmount("1.2345"));
  assert.ok(!isAcceptableAmount("0.0001"));
});

test("isAcceptableAmount rejects non-numeric text and a second decimal point", () => {
  assert.ok(!isAcceptableAmount("1.2.3"));
  assert.ok(!isAcceptableAmount("1e5"));
  assert.ok(!isAcceptableAmount("-1"));
  assert.ok(!isAcceptableAmount("abc"));
});

test("amountAfterEdit splices an insertion over the selected range", () => {
  assert.equal(amountAfterEdit("1.23", "4", 4, 4), "1.234");
  assert.equal(amountAfterEdit("1.23", "9", 0, 1), "9.23");
  assert.equal(amountAfterEdit("1.23", "", 1, 4), "1");
});

test("truncateAmount keeps three places and drops trailing zeros", () => {
  assert.equal(truncateAmount("0.010000000000000000"), "0.01");
  assert.equal(truncateAmount("1.9999"), "1.999");
  assert.equal(truncateAmount("2"), "2");
  assert.equal(truncateAmount("1.000"), "1");
});

test("truncateAmount never rounds up past the true value", () => {
  // 0.9999 rounding to 1.0 would offer more than the note actually holds.
  assert.equal(truncateAmount("0.9999"), "0.999");
});
