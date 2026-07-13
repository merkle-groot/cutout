#!/usr/bin/env bash
# Starknet-pool spike step 1 (toolchain-dependent half): Garaga BN254 Groth16 verifier codegen
# + verify the committed withdrawL2 fixture proof inside Cairo. VERIFIED WORKING end-to-end.
#
# Result: `snforge test` -> [PASS] test_verify_groth16_proof_bn254  (~45.4M l2_gas).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FIX="$HERE/fixtures"

# --- Toolchain that actually worked (pins come from Garaga's generated project) -------------------
#   brew install gmp
#   # Garaga (Python <=3.12); uv fetches 3.12 without touching system python:
#   CFLAGS="-I$(brew --prefix gmp)/include" LDFLAGS="-L$(brew --prefix gmp)/lib" \
#     uv pip install --prerelease=allow garaga==1.1.0   # (into a `uv venv --python 3.12`)
#   curl --proto '=https' -sSf https://docs.swmansion.com/scarb/install.sh | bash -s -- -v 2.16.1
#   curl -sSL https://raw.githubusercontent.com/foundry-rs/starknet-foundry/master/scripts/install.sh | sh
#   snfoundryup -v 0.57.0
export PATH="$HOME/.local/bin:$PATH"
GARAGA="${GARAGA:-garaga}"   # override with the venv's garaga path

# --- 1. Generate the Cairo verifier project from the withdrawL2 vkey (auto-detects bn254) ---------
rm -rf "$HERE/verifier" "$HERE/withdrawl2_verifier"
"$GARAGA" gen --system groth16 --vk "$FIX/groth16_vkey.json" --project-name withdrawl2_verifier
mv "$HERE/withdrawl2_verifier" "$HERE/verifier"

# --- 2. Turn the fixture proof+public signals into snforge test calldata --------------------------
"$GARAGA" calldata --system groth16 \
  --vk "$FIX/groth16_vkey.json" --proof "$FIX/proof.json" --public-inputs "$FIX/public.json" \
  --format snforge --output-path "$HERE/verifier/tests"

# --- 3. Build + verify the proof in Cairo (forks Sepolia for garaga's on-chain ECIP helpers) ------
cd "$HERE/verifier"
scarb build
snforge test   # expect: [PASS] test_verify_groth16_proof_bn254
