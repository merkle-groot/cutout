/**
 * Ordering for the notes list: spent notes sink below live ones.
 *
 * Notes arrive in discovery order, which puts a note the vault can no longer
 * spend directly above one it can. Spent notes are kept (they are the vault's
 * history, and SHOW SPENT exists to reveal them) but they are never what the
 * user is looking for first.
 */

/** What counts as "spent" differs by route: an L1 note is `spent` once its
 *  nullifier is burned; an L2 note is `withdrawn` once it has left the pool. */
export const SPENT_STATUS = { l1: "spent", l2: "withdrawn" };

/**
 * When a note came into existence, or `null` if this vault cannot say.
 *
 * An L1 note is dated by its deposit, or by the bridge that left it behind as
 * change. An L2 note is dated by the bridge that delivered it. All three are
 * local annotations, so a note recovered from chain events carries none of
 * them — hence the null rather than a guess.
 */
export function noteCreatedAt(note) {
  return note.depositedAt ?? note.changeAt ?? note.bridgedAt ?? note.at ?? null;
}

/**
 * Newest first, undated last.
 *
 * Undated notes sink rather than floating: `null` is "this vault never recorded
 * when", not "just now", and sorting them to the top would put the notes the
 * app knows least about above the ones the user just made. Same rule the
 * activity log applies (activity.js `byNewest`).
 *
 * Stable, so notes sharing a timestamp — or all lacking one — keep the order
 * they arrived in.
 */
export function newestFirst(notes, createdAt = noteCreatedAt) {
  return [...notes].sort((a, b) => {
    const left = createdAt(a);
    const right = createdAt(b);
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    return right - left;
  });
}

/**
 * Live notes first, spent notes after, each group keeping its original
 * relative order — a stable partition, so the ordering within a group stays
 * whatever discovery produced rather than being reshuffled.
 */
export function spentLast(notes, spentStatus) {
  // Stable, so composing it over `newestFirst` leaves each group newest-first.
  const live = [];
  const spent = [];
  for (const note of notes) (note.status === spentStatus ? spent : live).push(note);
  return [...live, ...spent];
}

/**
 * Largest value first.
 *
 * The other half of "which note did I mean": `newestFirst` answers it by time,
 * this one by size, and a vault holding many same-size notes needs the first
 * while a vault holding a few very different ones needs the second.
 *
 * Values are wei strings, so they are compared as bigints — `Number` would lose
 * precision above 2^53 and sort large notes wrongly against each other.
 */
export function largestFirst(notes, value = (note) => note.value) {
  return [...notes].sort((a, b) => {
    const left = BigInt(value(a) ?? 0);
    const right = BigInt(value(b) ?? 0);
    if (left === right) return 0;
    return left > right ? -1 : 1;
  });
}

/**
 * Notes whose description matches every whitespace-separated term in `query`.
 *
 * Terms are ANDed so a query narrows as it is typed, and matched
 * case-insensitively against whatever `describe` exposes — the caller decides
 * what is searchable, which keeps route-specific field names (an L1 note's
 * `commitment` versus an L2 note's `id`) out of here.
 *
 * An empty query returns the list untouched rather than nothing: a search box
 * that hides everything until it is typed into is a broken list, not a filter.
 */
export function matchingNotes(notes, query, describe) {
  const terms = String(query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...notes];
  return notes.filter((note) => {
    const haystack = describe(note).filter(Boolean).join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
