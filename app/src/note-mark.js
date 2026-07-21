import { keccak256, toHex } from "viem";

/**
 * A per-note mark: a cut-paper sigil plus a two-word name.
 *
 * The problem it solves is mundane. Notes are distinguished today by a value and
 * a truncated commitment, and a vault holding three 0.1 ETH notes shows three
 * rows reading `0.1 ETH · 0x8f3a…` — identical at a glance, told apart only by a
 * hex fragment nobody reads. The mark gives each note a shape and a name the eye
 * and the mouth can hold: "the amber otter one", not "the 0x8f3a one".
 *
 * DELIBERATELY NOT the address identicon of `identicon.js`. That is a mirrored
 * 7×7 grid; this is asymmetric layered shapes. The two must never look like one
 * family, because they mean different things — an address fingerprint is a change
 * detector you compare against a counterparty's screen, a note mark is a local
 * label for picking the right row out of a list. A user who learned to read one
 * as the other would compare the wrong thing.
 *
 * Like the identicon, this is NOT authentication. It seeds from the commitment,
 * which is public, so it is grindable and carries no secret. It also leaks
 * nothing new: anyone who can see the commitment can compute the mark.
 */

/** The app palette (style.css `:root`). */
const ACCENTS = ["#ffd33f", "#2fc0b5", "#3f70ed", "#f8629b", "#f0522d"];
const PAPER = "#fffdf8";
const INK = "#101010";

/**
 * Shape library, each a path over a 12×12 box.
 *
 * Every shape stays inside the box, so a quarter-turn about the centre also
 * stays inside it and the sigil never needs clipping.
 */
const SHAPES = [
  "M0,0 L12,0 L0,12 Z",                                  // triangle
  "M0,12 A12,12 0 0 0 12,0 L12,12 Z",                    // quarter disc
  "M0,6 A6,6 0 0 1 12,6 Z",                              // half circle
  "M0,3 H12 V9 H0 Z",                                    // bar
  "M6,1 A5,5 0 1 0 6,11 A5,5 0 1 0 6,1 Z",               // disc
  "M0,1 L6,6 L12,1 L12,6 L6,11 L0,6 Z",                  // chevron
  "M1,1 H11 V6 H6 V11 H1 Z",                             // notched square
  "M6,0 L12,6 L6,12 L0,6 Z",                             // diamond
];

/** The ink accent — rare, small, and the thing that lands like an eye in a face. */
const INK_MARKS = [
  '<circle cx="0" cy="0" r="1.7"/>',
  '<rect x="-2.4" y="-0.9" width="4.8" height="1.8"/>',
  '<path d="M-2,2 L0,-2 L2,2 Z"/>',
  '<path d="M-0.9,-2.4 H0.9 V-0.9 H2.4 V0.9 H0.9 V2.4 H-0.9 V0.9 H-2.4 V-0.9 H-0.9 Z"/>',
];
const INK_POSITIONS = [[3, 3], [9, 3], [3, 9], [9, 9]];
/** Diagonal offsets for the secondary scrap, so it never sits concentric with the cut. */
const OFFSETS = [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]];

/**
 * Two-word names, 32 × 32 = 1024 pairs.
 *
 * Words are short and phonetically distinct because the name's whole job is to
 * be said out loud and typed from memory. 1024 is not collision-free across a
 * large vault — that is fine, and why the sigil ships alongside it. Two notes
 * sharing a name will not share a shape.
 */
const ADJECTIVES = [
  "AMBER", "BRISK", "CALM", "DUSKY", "EAGER", "FROSTY", "GLAD", "HOLLOW",
  "IRON", "JADE", "KEEN", "LUCKY", "MELLOW", "NOBLE", "ODD", "PLUCKY",
  "QUIET", "RUSTY", "SILENT", "TIDY", "UPPER", "VIVID", "WARM", "ZESTY",
  "BOLD", "CRISP", "FLINT", "GRAVE", "HUSHED", "LOOSE", "MUTED", "PLAIN",
];
const NOUNS = [
  "OTTER", "BADGER", "CRANE", "DINGO", "EAGLE", "FINCH", "GOOSE", "HERON",
  "IBIS", "JACKAL", "LEMUR", "MOOSE", "NEWT", "ORCA", "PUMA", "QUAIL",
  "RAVEN", "STOAT", "TAPIR", "URCHIN", "VIPER", "WALRUS", "YAK", "ZEBRA",
  "BISON", "CIVET", "DOVE", "EGRET", "FERRET", "GECKO", "HAWK", "MARTEN",
];

/**
 * Bit reader over one keccak round.
 *
 * 256 bits against the sigil's 22 and the name's 10 — one round covers either
 * with room to spare. The domain tag keeps the two draws independent, so a note
 * whose name collides with another's still draws an unrelated shape.
 */
function bitReader(domain, id) {
  let bits = BigInt(keccak256(toHex(`${domain}:${String(id)}`)));
  return (width) => {
    const value = Number(bits & ((1n << BigInt(width)) - 1n));
    bits >>= BigInt(width);
    return value;
  };
}

/** `AMBER OTTER` — stable for the life of the note, derived from its commitment. */
export function noteName(id) {
  const take = bitReader("f5.notename.v1", id);
  return `${ADJECTIVES[take(5)]} ${NOUNS[take(5)]}`;
}

/**
 * The sigil's structure, separated from its rendering so it can be asserted on.
 *
 * Layers, back to front: a coloured scrap, a PAPER-coloured shape cut out of it,
 * a second coloured scrap offset off-centre, and an ink accent. The cut is always
 * paper and the accents are always distinct, so contrast holds by construction —
 * there is no seed that produces a mark of one flat colour, or of two colours
 * close enough to read as one.
 */
export function noteSigil(id) {
  const take = bitReader("f5.notesigil.v1", id);
  const scrap = ACCENTS[take(3) % ACCENTS.length];
  const accent = ACCENTS.filter((colour) => colour !== scrap)[take(3) % (ACCENTS.length - 1)];
  return {
    scrap,
    accent,
    cut: { path: SHAPES[take(3)], turn: take(2) * 90 },
    second: { path: SHAPES[take(3)], turn: take(2) * 90, offset: OFFSETS[take(2)] },
    ink: { mark: INK_MARKS[take(2)], at: INK_POSITIONS[take(2)] },
  };
}

/**
 * Render the sigil as an inline SVG.
 *
 * SVG for the same reason the identicon uses it: it is a string, so it composes
 * with the template-literal rendering used throughout, and one viewBox stays
 * crisp from the 26px row mark upward. Size is a render parameter only — the
 * layer geometry never varies with it, so a note looks the same everywhere it
 * appears.
 */
export function renderNoteSigil(id, { px = 26, label } = {}) {
  const { scrap, accent, cut, second, ink } = noteSigil(id);
  const spin = (turn) => `rotate(${turn} 6 6)`;
  // The secondary scrap is shrunk about the centre, then pushed off it; at 0.55
  // it stays inside the box under every offset, so no clip path is needed.
  const shift = `translate(${second.offset[0]} ${second.offset[1]}) translate(6 6) scale(0.55) translate(-6 -6)`;

  return `<svg class="note-sigil" width="${px}" height="${px}" viewBox="0 0 12 12" role="img" aria-label="${label ?? `Note mark ${noteName(id)}`}">`
    + `<rect width="12" height="12" fill="${scrap}"/>`
    + `<path d="${cut.path}" fill="${PAPER}" transform="${spin(cut.turn)}"/>`
    + `<path d="${second.path}" fill="${accent}" transform="${shift} ${spin(second.turn)}"/>`
    + `<g fill="${INK}" transform="translate(${ink.at[0]} ${ink.at[1]})">${ink.mark}</g>`
    + `</svg>`;
}
