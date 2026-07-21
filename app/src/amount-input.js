/**
 * Amount fields accept an ordinary decimal number, capped at three decimal
 * places.
 *
 * This replaced a fixed "x.xxx" mask. The mask was unambiguous but not
 * intuitive — it had no caret, so typing and backspace shifted digits sideways
 * instead of editing where you were looking, and it silently capped every
 * amount at 9.999. The cap is now the only rule, enforced by REJECTING an
 * edit that would break it rather than by rewriting what the user typed, so
 * the caret and normal text editing survive untouched.
 */

/** The default cap. Kept low on purpose: coarse amounts cluster, and clustering is
 *  exactly what widens the anonymity set (see anonymity-set.js). */
export const MAX_DECIMALS = 3;

/** Is `text` a decimal this field is willing to hold? Empty and a bare "." are
 *  allowed as intermediate states — a user typing "0." is not yet wrong. */
export function isAcceptableAmount(text, maxDecimals = MAX_DECIMALS) {
  return new RegExp(`^$|^\\d*(\\.\\d{0,${maxDecimals}})?$`).test(String(text));
}

/**
 * The value that results from replacing `[start, end)` of `current` with
 * `insert` — what the field would hold if the pending edit went through.
 */
export function amountAfterEdit(current, insert, start, end) {
  const text = String(current);
  return `${text.slice(0, start)}${insert}${text.slice(end)}`;
}

/**
 * Truncate a free-form decimal to the field's precision. Used for values the
 * app puts in the field itself (the pool minimum, a note's value via MAX),
 * which can carry full 18-decimal precision.
 *
 * Truncates, never rounds: rounding up could present an amount a hair over
 * what a note actually holds, which is the overspend `validateWithdrawAmount`
 * (bridge-flow.js) exists to reject.
 */
export function truncateAmount(value, maxDecimals = MAX_DECIMALS) {
  const [whole = "0", fraction = ""] = String(value ?? "").split(".");
  const kept = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  return kept ? `${whole}.${kept}` : whole;
}
