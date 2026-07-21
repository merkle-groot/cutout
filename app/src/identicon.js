import { keccak256, toHex } from "viem";

/**
 * A deterministic visual fingerprint of a shielded address.
 *
 * This is a CHANGE DETECTOR, never authentication. The grid holds ~53 bits, so a
 * motivated impersonator can grind a meta-address whose icon matches yours — it
 * is cheap to search and there is no secret in it. What it catches is the far
 * likelier failure: the wrong mnemonic restored, a second identity loaded by
 * accident, a resolution that silently returned someone else's keys. Never gate
 * a spend on it, and never word the UI as if a match proves anything.
 *
 * The seed is the same canonical string `identityFingerprint` uses in
 * `vault-identity.js`, so the icon changes exactly when that cached-publication
 * fingerprint changes. Two renderings of one identity are always identical —
 * that is the whole contract, and it is why size is a render parameter and never
 * a grid parameter. A topbar icon drawn on a different grid than the credential
 * icon would not be comparable, which defeats the point of having a fingerprint.
 */

/** Unique columns are mirrored to produce a symmetric GRID×GRID icon. */
const GRID = 7;
const HALF = Math.ceil(GRID / 2);

/** Cell states. */
const EMPTY = 0;
const PRIMARY = 1;
const SECONDARY = 2;
const INK = 3;

/**
 * Cell states are drawn from 3 bits against a deliberately uneven distribution:
 * half empty, a quarter primary, an eighth each secondary and ink.
 *
 * A flat 2-bit draw fills three cells in four and every icon collapses into the
 * same grey mush — recognisable only by colour, which is the one dimension a
 * colourblind user cannot use. Weighting toward empty buys negative space, and
 * makes ink a rare accent that lands like the eyes in a face.
 */
const CELL_STATES = [EMPTY, EMPTY, EMPTY, EMPTY, PRIMARY, PRIMARY, SECONDARY, INK];

/** The app palette (style.css `:root`). Ink and paper are fixed; accents are chosen by the seed. */
const ACCENTS = ["#ffd33f", "#2fc0b5", "#3f70ed", "#f8629b", "#f0522d"];
const PAPER = "#fffdf8";
const INK_COLOR = "#101010";

export function identiconSeed(shielded) {
  const { B, V } = shielded;
  return `${B[0]},${B[1]}:${V[0]},${V[1]}`;
}

/**
 * Expand the seed into enough bits for the grid.
 *
 * One keccak round yields 256 bits; the grid needs 2 per cell (28 cells = 56)
 * plus the accent choices, so a single round is sufficient with room to spare.
 */
function seedBits(seed) {
  return BigInt(keccak256(toHex(`f5.identicon.v1:${seed}`)));
}

/**
 * The mirrored cell grid, as rows of cell states.
 *
 * Bits are consumed left-to-right across the unique columns of each row, then
 * the row is mirrored. Column HALF-1 is the centre line and is not duplicated.
 */
export function identiconCells(shielded) {
  let bits = seedBits(identiconSeed(shielded));
  const take = (width) => {
    const value = Number(bits & ((1n << BigInt(width)) - 1n));
    bits >>= BigInt(width);
    return value;
  };

  const rows = [];
  for (let y = 0; y < GRID; y += 1) {
    const unique = [];
    for (let x = 0; x < HALF; x += 1) unique.push(CELL_STATES[take(3)]);
    const mirrored = unique.slice(0, HALF - 1).reverse();
    rows.push([...unique, ...mirrored]);
  }

  // Accents are drawn last so the cell layout is unaffected by palette choice.
  const primary = ACCENTS[take(3) % ACCENTS.length];
  const rest = ACCENTS.filter((colour) => colour !== primary);
  const secondary = rest[take(3) % rest.length];

  return { rows, primary, secondary };
}

function cellColour(state, primary, secondary) {
  if (state === PRIMARY) return primary;
  if (state === SECONDARY) return secondary;
  if (state === INK) return INK_COLOR;
  return PAPER;
}

/**
 * Render the fingerprint as an inline SVG.
 *
 * SVG rather than a canvas or a div grid: it is a string, so it composes with
 * the template-literal rendering used everywhere else here, and it stays crisp
 * from the 28px topbar mark up to the 120px credential mark off one viewBox.
 *
 * @param px rendered edge length; the grid itself never changes.
 */
export function renderIdenticon(shielded, { px = 120, label = "Shielded address fingerprint" } = {}) {
  const { rows, primary, secondary } = identiconCells(shielded);
  // Gaps read as texture at card size and as mud below ~40px, so drop them there.
  const gap = px >= 40 ? 0.08 : 0;
  const cells = rows.flatMap((row, y) => row.map((state, x) => {
    if (state === EMPTY) return "";
    const colour = cellColour(state, primary, secondary);
    return `<rect x="${(x + gap / 2).toFixed(3)}" y="${(y + gap / 2).toFixed(3)}" width="${(1 - gap).toFixed(3)}" height="${(1 - gap).toFixed(3)}" fill="${colour}"/>`;
  })).join("");

  return `<svg class="identicon" width="${px}" height="${px}" viewBox="0 0 ${GRID} ${GRID}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${GRID}" height="${GRID}" fill="${PAPER}"/>${cells}</svg>`;
}
