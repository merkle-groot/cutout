import assert from "node:assert/strict";
import test from "node:test";
import { atLeastCohort, betterNearbyAmount, exactCohort, trimBenefit } from "./anonymity-set.js";

const e = (n) => BigInt(Math.round(n * 1000)) * 10n ** 15n; // ETH -> wei, 3dp like the amount field

// 0.1 x4, 0.5 x3, 0.099 x1, 1.0 x2
const POOL = [e(0.1), e(0.1), e(0.1), e(0.1), e(0.5), e(0.5), e(0.5), e(0.099), e(1), e(1)];

test("exactCohort counts only deposits of the same size", () => {
  assert.equal(exactCohort(POOL, e(0.1)), 4);
  assert.equal(exactCohort(POOL, e(0.5)), 3);
  assert.equal(exactCohort(POOL, e(0.099)), 1);
  assert.equal(exactCohort(POOL, e(0.2)), 0);
});

test("exactCohort accepts the string values the deposits API returns", () => {
  assert.equal(exactCohort(POOL.map(String), e(0.1)), 4);
});

test("atLeastCohort counts every deposit that could have funded the withdrawal", () => {
  // A withdrawal only proves the note held AT LEAST that much, so the bound is >=.
  assert.equal(atLeastCohort(POOL, e(1)), 2);
  assert.equal(atLeastCohort(POOL, e(0.5)), 5);
  assert.equal(atLeastCohort(POOL, e(0.1)), 9);
  assert.equal(atLeastCohort(POOL, e(0.099)), 10);
});

test("the withdrawal crowd never shrinks as the amount falls", () => {
  let previous = 0;
  for (const amount of [e(1), e(0.5), e(0.1), e(0.099), e(0.001)]) {
    const cohort = atLeastCohort(POOL, amount);
    assert.ok(cohort >= previous, `${amount} gave ${cohort}, below the larger amount's ${previous}`);
    previous = cohort;
  }
});

test("a non-positive or missing amount has no meaningful crowd", () => {
  for (const fn of [exactCohort, atLeastCohort]) {
    assert.equal(fn(POOL, 0n), null);
    assert.equal(fn(POOL, null), null);
    assert.equal(fn(POOL, undefined), null);
  }
});

test("betterNearbyAmount steers an odd amount onto a populated one", () => {
  assert.deepEqual(betterNearbyAmount(POOL, e(0.099)), { amount: e(0.1), cohort: 4 });
});

test("betterNearbyAmount stays quiet when the amount is already the best nearby", () => {
  assert.equal(betterNearbyAmount(POOL, e(0.1)), null);
});

test("betterNearbyAmount never suggests depositing less than asked", () => {
  // 0.5 has a smaller crowd than 0.1, but going DOWN is not a suggestion we make.
  const suggestion = betterNearbyAmount(POOL, e(0.5));
  assert.ok(suggestion === null || suggestion.amount > e(0.5));
});

test("betterNearbyAmount will not tie up several times the capital", () => {
  // 1.0 is within 2x of 0.6 and has a crowd of 2 vs 0 — allowed.
  assert.deepEqual(betterNearbyAmount(POOL, e(0.6)), { amount: e(1), cohort: 2 });
  // At 0.4 the ceiling is 0.8, so 0.5 is offered and 1.0 — 2.5x the capital — is not.
  assert.deepEqual(betterNearbyAmount(POOL, e(0.4)), { amount: e(0.5), cohort: 3 });
});

test("betterNearbyAmount prefers the smaller amount when two crowds tie", () => {
  const pool = [e(0.2), e(0.2), e(0.3), e(0.3)];
  assert.deepEqual(betterNearbyAmount(pool, e(0.15)), { amount: e(0.2), cohort: 2 });
});

test("trimBenefit finds the amount that widens the withdrawal crowd", () => {
  // Bridging the full 1.0 note admits 2 sources; trimming to 0.5 admits 5.
  assert.deepEqual(trimBenefit(POOL, e(1), e(1)), { amount: e(0.5), cohort: 5 });
});

test("trimBenefit stays quiet at the bottom of the pool", () => {
  assert.equal(trimBenefit(POOL, e(0.099), e(1)), null);
});

test("trimBenefit will not advise bridging a fraction of what was asked", () => {
  // The live pool's real shape: eight 0.099 and one 0.0099. Trimming to 0.0099
  // does widen the crowd by one, and is terrible advice.
  const pool = [...Array(8).fill(e(0.099)), e(0.0099)];
  assert.equal(trimBenefit(pool, e(0.099), e(0.099)), null);
});

test("trimBenefit ignores an amount the note cannot cover", () => {
  assert.equal(trimBenefit(POOL, e(1), e(0.5)), null);
});
