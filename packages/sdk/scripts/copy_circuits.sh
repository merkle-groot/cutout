#!/bin/bash
set -euo pipefail

# Copies circuit artifacts consumed by the SDK at runtime (wasm + proving/verification keys)
# into the packaged artifact dir. Asset names must match `circuitToAsset` in
# src/circuits/circuits.interface.ts.

CIRCUITS_DIR="../circuits"
DEST_DIR="./dist/node/artifacts"
mkdir -p "$DEST_DIR"

# --- Mode-3 withdrawal circuits (withdrawL1, withdrawL2) ---
# TODO(trusted-setup): these copy the *development* Groth16 keys produced by
# `yarn setup:all` in packages/circuits. A real trusted-setup ceremony MUST
# replace build/withdrawL{1,2}/groth16_{pkey.zkey,vkey.json} with final keys
# (mirroring trusted-setup/final-keys/) before any mainnet release.
for circuit in withdrawL1 withdrawL2
do
  cp "$CIRCUITS_DIR/build/${circuit}/${circuit}_js/${circuit}.wasm" "$DEST_DIR/${circuit}.wasm"
  cp "$CIRCUITS_DIR/build/${circuit}/groth16_pkey.zkey"            "$DEST_DIR/${circuit}.zkey"
  cp "$CIRCUITS_DIR/build/${circuit}/groth16_vkey.json"           "$DEST_DIR/${circuit}.vkey"
done

# --- Commitment circuit (ragequit path) ---
# The deployed verifier was generated from the ceremony keys below. The compiled
# commitmentL1 wasm matches those keys; the circuits CI proves and verifies this
# pairing so packaging cannot silently ship incompatible ragequit artifacts.
if [ -f "$CIRCUITS_DIR/trusted-setup/final-keys/commitment.zkey" ]; then
  cp "$CIRCUITS_DIR/trusted-setup/final-keys/commitment.zkey" "$DEST_DIR/commitment.zkey"
  cp "$CIRCUITS_DIR/trusted-setup/final-keys/commitment.vkey" "$DEST_DIR/commitment.vkey"
fi
if [ -f "$CIRCUITS_DIR/build/commitment/commitment_js/commitment.wasm" ]; then
  cp "$CIRCUITS_DIR/build/commitment/commitment_js/commitment.wasm" "$DEST_DIR/commitment.wasm"
elif [ -f "$CIRCUITS_DIR/build/commitmentL1/commitmentL1_js/commitmentL1.wasm" ]; then
  # The SDK keeps the historical `commitment.*` asset names for API compatibility.
  cp "$CIRCUITS_DIR/build/commitmentL1/commitmentL1_js/commitmentL1.wasm" "$DEST_DIR/commitment.wasm"
else
  echo "WARN: no commitment wasm found (circuit rename in progress); commitment.wasm not copied" >&2
fi

echo "Copied circuit artifacts to $DEST_DIR"
