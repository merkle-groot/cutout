/**
 * How large a crowd a deposit or a withdrawal hides in.
 *
 * Amount is the axis, and the only one. Deposits are destination-agnostic — the
 * destination is a property of the WITHDRAWAL — so routing to N chains
 * concentrates one anonymity set instead of splitting it, and a per-chain count
 * would measure route popularity while looking like privacy. There is
 * deliberately no chain parameter anywhere in this module.
 *
 * The two counts differ because the chain publishes different things at the two
 * moments:
 *
 *   deposit    `Deposited._value` is public and exact, so the crowd is the set of
 *              deposits carrying the SAME value. Exact.
 *
 *   withdrawal `Withdrawn._value` (W) only proves the spent note held at least W.
 *              A note's value never exceeds the deposit that started its label's
 *              chain (`remainingValue <== existingValue - withdrawnValue`, so a
 *              chain only ever shrinks), which makes every deposit worth >= W a
 *              candidate source. A LOWER BOUND, and deliberately so: overstating
 *              a crowd is the one error that actually costs a user something.
 *
 * Spent deposits are never subtracted, because they cannot be identified. A
 * nullifier hash is unlinkable to the deposit it burns, and a partial spend
 * leaves a change note whose value is sealed inside a commitment. Only the count
 * of withdrawals is public, never which deposits they consumed — so these
 * numbers describe the candidate set the chain admits, not a live population.
 */

/** Deposit values as bigints, tolerating the string form the API returns. */
function toValues(values) {
  return (values ?? []).map((value) => (typeof value === "bigint" ? value : BigInt(value)));
}

/**
 * Deposits carrying exactly `amount` — the crowd a new deposit of that size
 * joins, and the crowd it is indistinguishable within if it is later spent whole.
 */
export function exactCohort(values, amount) {
  if (amount === null || amount === undefined || amount <= 0n) return null;
  return toValues(values).filter((value) => value === amount).length;
}

/**
 * Deposits that could have funded a withdrawal of `amount`: every deposit worth
 * at least that much.
 */
export function atLeastCohort(values, amount) {
  if (amount === null || amount === undefined || amount <= 0n) return null;
  return toValues(values).filter((value) => value >= amount).length;
}

/**
 * A nearby deposit amount that would hide the user better, or null when the one
 * they have chosen is already as good as anything close to it.
 *
 * Only ever suggests amounts the pool ALREADY holds. A synthetic "round number"
 * suggestion would be guesswork about where deposits will land; an amount other
 * people have actually used is a crowd that exists today.
 *
 * Bounded to [amount, amount * maxMultiple] because the suggestion has to be
 * takeable: never propose depositing LESS than the user asked for, and never
 * propose tying up several times more just to hide better.
 */
export function betterNearbyAmount(values, amount, { maxMultiple = 2n } = {}) {
  if (amount === null || amount === undefined || amount <= 0n) return null;
  const current = exactCohort(values, amount);
  const ceiling = amount * maxMultiple;

  const counts = new Map();
  for (const value of toValues(values)) {
    if (value <= amount || value > ceiling) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let best = null;
  for (const [value, cohort] of counts) {
    if (cohort <= current) continue;
    // Ties go to the smaller amount: same crowd for less capital committed.
    if (best === null || cohort > best.cohort || (cohort === best.cohort && value < best.amount)) {
      best = { amount: value, cohort };
    }
  }
  return best;
}

/**
 * The crowd a withdrawal of `amount` would gain by leaving some value behind as
 * a change note, or null when trimming it buys nothing.
 *
 * This is the one lever a user has at bridge time. Withdrawing less than the
 * full note is free anonymity — the leftover stays shielded in a change note —
 * and the count rising as the amount falls is the clearest way to show it.
 */
export function trimBenefit(values, amount, noteValue, { minFraction = 2n } = {}) {
  if (amount === null || amount === undefined || amount <= 0n) return null;
  if (noteValue === null || noteValue === undefined || amount > noteValue) return null;

  const current = atLeastCohort(values, amount);
  // The next amount DOWN that changes the answer is the largest deposit value
  // strictly below `amount` — anything between the two counts identically.
  //
  // Floored at amount/minFraction because a suggestion has to be worth taking. A
  // pool of eight 0.099 deposits and one 0.0099 would otherwise advise bridging a
  // tenth of what was asked to gain a single person — technically a larger crowd,
  // and useless advice.
  const floor = amount / minFraction;
  let candidate = null;
  for (const value of toValues(values)) {
    if (value >= amount || value < floor) continue;
    if (candidate === null || value > candidate) candidate = value;
  }
  if (candidate === null) return null;

  const cohort = atLeastCohort(values, candidate);
  return cohort > current ? { amount: candidate, cohort } : null;
}
