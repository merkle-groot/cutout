#!/usr/bin/env bash
# Export a Solidity Groth16 verifier from a circuit's proving key and post-process
# it into the shape committed under packages/contracts (renamed contract + forgefmt
# guards), so `yarn gencontract:*` reproduces the checked-in verifier exactly.
#
# Usage: gen-verifier.sh <circuit> <ContractName>
#   e.g. gen-verifier.sh withdrawL1 WithdrawalVerifier
set -euo pipefail

CIRCUIT="$1"
CONTRACT="$2"

ZKEY="build/${CIRCUIT}/groth16_pkey.zkey"
OUT="../contracts/src/contracts/verifiers/${CONTRACT}.sol"

if [ ! -f "$ZKEY" ]; then
  echo "error: $ZKEY not found — run 'yarn setup:${CIRCUIT}' first" >&2
  exit 1
fi

TMP="$(mktemp)"
npx snarkjs zkey export solidityverifier "$ZKEY" "$TMP"

# Insert forgefmt guard after the SPDX line, rename the contract, append end guard.
perl -0pi -e 's{// SPDX-License-Identifier: GPL-3.0\n}{// SPDX-License-Identifier: GPL-3.0\n// forgefmt: disable-start\n}' "$TMP"
perl -pi -e "s/^contract Groth16Verifier \{/contract ${CONTRACT} {/" "$TMP"
printf '\n// forgefmt: disable-end\n' >> "$TMP"

mv "$TMP" "$OUT"
echo "wrote $OUT"
