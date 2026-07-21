import assert from "node:assert/strict";
import test from "node:test";
import { noteName, noteSigil, renderNoteSigil } from "./note-mark.js";
import { renderIdenticon } from "./identicon.js";

const id = "0x8f3a91c7d2e4b5a6f80912345678abcdef0123456789abcdef0123456789abcd";
const other = "0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";

test("is stable for one note and different for another", () => {
  assert.equal(noteName(id), noteName(id));
  assert.deepEqual(noteSigil(id), noteSigil(id));
  assert.equal(renderNoteSigil(id), renderNoteSigil(id));

  assert.notEqual(renderNoteSigil(id), renderNoteSigil(other));
});

test("accepts the bigint and number commitment forms the vault stores", () => {
  assert.equal(noteName(123n), noteName("123"));
  assert.equal(renderNoteSigil(123n), renderNoteSigil("123"));
});

test("names read as two distinct words", () => {
  assert.match(noteName(id), /^[A-Z]+ [A-Z]+$/);
});

test("the name draw covers the full wordlist and is not skewed to one pair", () => {
  const names = new Set();
  for (let i = 0; i < 4000; i += 1) names.add(noteName(`note-${i}`));
  // 1024 possible pairs; 4000 draws should reach nearly all of them.
  assert.ok(names.size > 950, `expected near-full coverage, saw ${names.size}`);
});

test("the cut is always paper and the two scraps never share a colour", () => {
  for (let i = 0; i < 300; i += 1) {
    const { scrap, accent } = noteSigil(`note-${i}`);
    assert.notEqual(scrap, accent, "a same-colour sigil would read as one flat square");
  }
  assert.match(renderNoteSigil(id), /fill="#fffdf8"/);
});

test("every layer stays inside the viewBox, so the mark never needs clipping", () => {
  for (let i = 0; i < 200; i += 1) {
    const [dx, dy] = noteSigil(`note-${i}`).second.offset;
    // Shape spans 0..12, scaled 0.55 about the centre, then pushed by the offset.
    assert.ok(6 - 3.3 + dx >= 0 && 6 + 3.3 + dx <= 12);
    assert.ok(6 - 3.3 + dy >= 0 && 6 + 3.3 + dy <= 12);
  }
});

test("renders at any size off one viewBox, so a note looks the same everywhere", () => {
  const small = renderNoteSigil(id, { px: 26 });
  const large = renderNoteSigil(id, { px: 64 });

  assert.match(small, /viewBox="0 0 12 12"/);
  assert.match(large, /viewBox="0 0 12 12"/);
  assert.match(small, /width="26"/);
  assert.match(large, /width="64"/);
  const layers = (svg) => (svg.match(/<path|<rect|<circle/g) ?? []).length;
  assert.equal(layers(small), layers(large));
});

test("labels itself with the note name so the mark is not screen-reader dead", () => {
  assert.match(renderNoteSigil(id), new RegExp(`aria-label="Note mark ${noteName(id)}"`));
  assert.match(renderNoteSigil(id, { label: "Selected note" }), /aria-label="Selected note"/);
});

test("cannot be confused with the address fingerprint it sits near", () => {
  const address = renderIdenticon({ B: [1n, 2n], V: [3n, 4n] });
  // Different grid, different class hook: the two marks must not read as one family.
  assert.match(address, /viewBox="0 0 7 7"/);
  assert.match(renderNoteSigil(id), /viewBox="0 0 12 12"/);
  assert.match(address, /class="identicon"/);
  assert.match(renderNoteSigil(id), /class="note-sigil"/);
});
