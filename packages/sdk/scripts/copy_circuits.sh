#!/bin/bash
set -uo pipefail

# Copies circuit artifacts consumed by the SDK at runtime (wasm + proving/verification keys)
# into the packaged artifact dir. Asset names must match `circuitToAsset` in
# src/circuits/circuits.interface.ts.
#
# Runs as part of `yarn build`, not only `build:bundle`. `build` starts with `clean`
# (rm -rf dist), so a build that skipped this step left dist/node/artifacts missing
# entirely and every proof failed at artifact fetch — see the manifest note below for
# why that failure was worse than it looked.
#
# Missing circuit build outputs are a WARNING, not an error: a fresh clone or a CI job
# that only wants the JS bundle has never run `yarn circuits:setup`, and failing the
# whole build there would be wrong. The manifest records what actually landed so the
# gap is visible instead of silent.

CIRCUITS_DIR="../circuits"
DEST_DIR="./dist/node/artifacts"
mkdir -p "$DEST_DIR"

COPIED=0
MISSING=0

# macOS ships `shasum`, most Linux images ship `sha256sum`, and neither is guaranteed.
# A manifest without digests is still useful, so a missing tool degrades rather than fails.
sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else printf 'unavailable'; fi
}

# --- Mode-3 withdrawal circuits (withdrawL1, withdrawL2) ---
# TODO(trusted-setup): these copy the *development* Groth16 keys produced by
# `yarn setup:all` in packages/circuits. A real trusted-setup ceremony MUST
# replace build/withdrawL{1,2}/groth16_{pkey.zkey,vkey.json} with final keys
# (mirroring trusted-setup/final-keys/) before any mainnet release.
#
# Until then these keys carry a hazard that is not obvious from reading the code:
# `yarn setup:all` re-runs the phase-2 contribution with FRESH randomness, so every
# run produces a new `delta` and silently invalidates any verifier already deployed
# from the previous one. The circuit is unchanged, the proof still verifies locally,
# and the only symptom is `InvalidProof()` from the chain. `ops/check-deployment.sh`
# compares the delta recorded below against the deployed verifier for exactly this.
for circuit in withdrawL1 withdrawL2
do
  wasm="$CIRCUITS_DIR/build/${circuit}/${circuit}_js/${circuit}.wasm"
  zkey="$CIRCUITS_DIR/build/${circuit}/groth16_pkey.zkey"
  vkey="$CIRCUITS_DIR/build/${circuit}/groth16_vkey.json"
  if [ -f "$wasm" ] && [ -f "$zkey" ] && [ -f "$vkey" ]; then
    cp "$wasm" "$DEST_DIR/${circuit}.wasm"
    cp "$zkey" "$DEST_DIR/${circuit}.zkey"
    cp "$vkey" "$DEST_DIR/${circuit}.vkey"
    COPIED=$((COPIED + 1))
  else
    echo "WARN: $circuit build outputs not found under $CIRCUITS_DIR/build -- run 'yarn circuits:setup'" >&2
    MISSING=$((MISSING + 1))
  fi
done

# --- Commitment circuit (ragequit path) ---
# The deployed verifier was generated from the ceremony keys below. The compiled
# commitmentL1 wasm matches those keys; the circuits CI proves and verifies this
# pairing so packaging cannot silently ship incompatible ragequit artifacts.
if [ -f "$CIRCUITS_DIR/trusted-setup/final-keys/commitment.zkey" ]; then
  cp "$CIRCUITS_DIR/trusted-setup/final-keys/commitment.zkey" "$DEST_DIR/commitment.zkey"
  cp "$CIRCUITS_DIR/trusted-setup/final-keys/commitment.vkey" "$DEST_DIR/commitment.vkey"
  COPIED=$((COPIED + 1))
else
  echo "WARN: commitment ceremony keys not found; ragequit artifacts not copied" >&2
  MISSING=$((MISSING + 1))
fi
if [ -f "$CIRCUITS_DIR/build/commitment/commitment_js/commitment.wasm" ]; then
  cp "$CIRCUITS_DIR/build/commitment/commitment_js/commitment.wasm" "$DEST_DIR/commitment.wasm"
elif [ -f "$CIRCUITS_DIR/build/commitmentL1/commitmentL1_js/commitmentL1.wasm" ]; then
  # The SDK keeps the historical `commitment.*` asset names for API compatibility.
  cp "$CIRCUITS_DIR/build/commitmentL1/commitmentL1_js/commitmentL1.wasm" "$DEST_DIR/commitment.wasm"
else
  echo "WARN: no commitment wasm found (circuit rename in progress); commitment.wasm not copied" >&2
fi

# --- Manifest ---
# Records what each artifact IS, so a mismatch can be diagnosed without re-deriving it
# from a 20MB zkey. `delta` is the phase-2 contribution and the only part of a vkey that
# changes when the keys are regenerated for an unchanged circuit — it is therefore the
# field that identifies which verifier a proof will satisfy. Written in the same
# swapped coordinate order snarkjs uses for the Solidity template (vk_delta_2[i][1]
# first), so it can be compared to a deployed verifier's constants directly.
node -e '
const fs = require("fs"), path = require("path");
const dest = process.argv[1];
const provenance = { withdrawL1: "development", withdrawL2: "development", commitment: "ceremony" };
const sha = (f) => { try { return require("crypto").createHash("sha256").update(fs.readFileSync(f)).digest("hex"); } catch { return null; } };

const artifacts = {};
for (const [name, source] of Object.entries(provenance)) {
  const vkeyPath = path.join(dest, `${name}.vkey`);
  if (!fs.existsSync(vkeyPath)) continue;
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));
  artifacts[name] = {
    provenance: source,
    nPublic: vkey.nPublic,
    delta: { x1: vkey.vk_delta_2[0][1], x2: vkey.vk_delta_2[0][0], y1: vkey.vk_delta_2[1][1], y2: vkey.vk_delta_2[1][0] },
    vkeySha256: sha(vkeyPath),
    zkeySha256: sha(path.join(dest, `${name}.zkey`)),
  };
}
fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), artifacts }, null, 2) + "\n");
' "$DEST_DIR" || echo "WARN: could not write $DEST_DIR/manifest.json" >&2

if [ "$MISSING" -gt 0 ]; then
  echo "Copied circuit artifacts to $DEST_DIR ($COPIED group(s) copied, $MISSING missing -- proving will fail until resolved)" >&2
else
  echo "Copied circuit artifacts to $DEST_DIR"
fi

# Development keys are a deployment hazard, so say so on every build rather than
# leaving it to a comment nobody opens.
if [ -f "$DEST_DIR/withdrawL1.vkey" ]; then
  echo "NOTE: withdrawL1/withdrawL2 use DEVELOPMENT Groth16 keys. Re-running 'yarn setup:all' invalidates" >&2
  echo "      any verifier already deployed from the previous keys. Run 'yarn check:deployment' after." >&2
fi
