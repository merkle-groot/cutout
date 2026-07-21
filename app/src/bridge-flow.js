/**
 * Pure value arithmetic for a partial (less-than-full-note) bridge withdrawal.
 *
 * Kept separate from `runSend` so the bounds check, the fee cut, and the change
 * left behind can be tested without proving, relaying, or touching `state`.
 */

/**
 * `0 < withdrawnValue <= noteValue`, or a message explaining which side failed.
 *
 * The upper bound matters as much as the lower one: `withdrawL1.circom`'s
 * `remainingValue <== existingValue - withdrawnValue` is range-checked with
 * `Num2Bits(128)`, so a withdrawal that overspends the note wraps to a huge
 * field element and fails witness generation deep inside snarkjs — a wasted,
 * minute-long proving pass with an unreadable error. Catching it here means a
 * clear message before proving ever starts.
 */
export function validateWithdrawAmount(withdrawnValue, noteValue) {
  if (withdrawnValue <= 0n) return "Enter a positive withdrawal amount.";
  if (withdrawnValue > noteValue) return "Cannot withdraw more than the note's value.";
  return null;
}

/**
 * Net value delivered to L2 after the relayer's cut.
 *
 * The cut is BPS of the WITHDRAWN amount, not the full note — a partial
 * withdrawal must not pay a fee sized for value that never leaves L1.
 */
export function bridgedValueAfterFee(withdrawnValue, feeBps) {
  return withdrawnValue - (withdrawnValue * feeBps) / 10_000n;
}

/**
 * Basis points out of a `GET /api/quote` body, as a bigint `bridgedValueAfterFee`
 * can take.
 *
 * Reads the raw `bps` field when present, but falls back to the far older
 * `feeBps` — which, despite the name, has always carried a PERCENT (0.3 for
 * 30 bps). The fallback is not cosmetic: without it a server that has not
 * restarted since `bps` was added serves a body with no `bps` key and the fee
 * preview sits on "loading…" forever, which is exactly how this shipped broken.
 */
export function relayFeeBpsFromQuote(quote) {
  if (typeof quote?.bps === "number" && Number.isFinite(quote.bps)) return BigInt(Math.round(quote.bps));
  if (typeof quote?.feeBps === "number" && Number.isFinite(quote.feeBps)) return BigInt(Math.round(quote.feeBps * 100));
  return null;
}

/** What stays behind in the L1 change note. Zero for a full withdrawal. */
export function remainingNoteValue(noteValue, withdrawnValue) {
  return noteValue - withdrawnValue;
}

/**
 * Clamp a proposed withdrawal down to the note's value.
 *
 * The amount field (amount-input.js) only constrains the SHAPE of what is
 * typed — three decimal places — and has no idea which note is selected. This
 * is the value bound, applied in the UI on every keystroke, so a user can
 * never see or submit a figure above the note they picked.
 */
export function clampWithdrawAmount(withdrawnValue, noteValue) {
  return withdrawnValue > noteValue ? noteValue : withdrawnValue;
}
