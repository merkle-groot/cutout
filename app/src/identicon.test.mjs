import assert from "node:assert/strict";
import test from "node:test";
import { identiconCells, identiconSeed, renderIdenticon } from "./identicon.js";

const shielded = {
  B: [12345678901234567890n, 22345678901234567890n],
  V: [32345678901234567890n, 42345678901234567890n],
};
const other = { ...shielded, B: [1n, 2n] };

test("is deterministic for one identity", () => {
  assert.deepEqual(identiconCells(shielded), identiconCells(shielded));
  assert.equal(renderIdenticon(shielded), renderIdenticon(shielded));
});

test("separates identities that differ in any single key limb", () => {
  const seen = new Set();
  for (const key of ["B", "V"]) {
    for (const limb of [0, 1]) {
      const changed = { ...shielded, [key]: [...shielded[key]] };
      changed[key][limb] += 1n;
      seen.add(JSON.stringify(identiconCells(changed).rows));
    }
  }
  seen.add(JSON.stringify(identiconCells(shielded).rows));
  assert.equal(seen.size, 5, "each limb must feed the grid");
});

test("mirrors every row so the icon is left-right symmetric", () => {
  for (const row of identiconCells(shielded).rows) {
    assert.equal(row.length, 7);
    assert.deepEqual(row, [...row].reverse());
  }
});

test("picks two distinct accent colours", () => {
  const { primary, secondary } = identiconCells(shielded);
  assert.notEqual(primary, secondary);
});

test("renders one grid at any size, so two placements stay comparable", () => {
  const big = renderIdenticon(shielded, { px: 120 });
  const small = renderIdenticon(shielded, { px: 28 });

  assert.match(big, /viewBox="0 0 7 7"/);
  assert.match(small, /viewBox="0 0 7 7"/);
  assert.match(big, /width="120"/);
  assert.match(small, /width="28"/);
  // Same cell count regardless of size: only the gap and the edge length move.
  const count = (svg) => (svg.match(/<rect/g) ?? []).length;
  assert.equal(count(big), count(small));
});

test("carries an accessible label", () => {
  assert.match(renderIdenticon(shielded, { label: "Recipient fingerprint" }), /aria-label="Recipient fingerprint"/);
});

test("seeds from the same canonical string the publication fingerprint uses", () => {
  assert.equal(identiconSeed(shielded), `${shielded.B[0]},${shielded.B[1]}:${shielded.V[0]},${shielded.V[1]}`);
  assert.notEqual(identiconSeed(shielded), identiconSeed(other));
});
