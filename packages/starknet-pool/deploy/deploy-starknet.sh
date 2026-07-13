#!/usr/bin/env bash
# Deploy the Starknet destination pool (verifier + StarknetPrivacyPool) to any Starknet network.
# Reusable across networks via env vars, mirroring packages/contracts/script/DeployL2.s.sol.
#
# Required env:
#   SN_ACCOUNT            sncast account name (import once: `sncast account import ...`)
#   SN_RPC               Starknet RPC URL
#   L1_POOL_ADDRESS      L1 pool address as a felt (the l1_handler `from_address`; placeholder ok
#                        pre-Stage-3, set the real L1 pool before the end-to-end run)
#   SN_ASSET_ADDRESS     L2 ERC20 the pool holds (StarkGate-bridged token) as a felt
# Optional env:
#   SN_MAX_RELAY_FEE_BPS max relay fee bps (default 100)
#   SN_VERIFY_FIXTURE    if set to 1, also runs an on-chain groth16 verify with the spike fixture
#
# Writes deployments/starknet-<chainId>.json.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/.."
cd "$ROOT"

: "${SN_ACCOUNT:?set SN_ACCOUNT}"
: "${SN_RPC:?set SN_RPC}"
: "${L1_POOL_ADDRESS:?set L1_POOL_ADDRESS (felt)}"
: "${SN_ASSET_ADDRESS:?set SN_ASSET_ADDRESS (L2 ERC20 felt)}"
MAX_BPS="${SN_MAX_RELAY_FEE_BPS:-100}"

SNCAST=(sncast --account "$SN_ACCOUNT")
jqf() { python3 -c "import json,sys;print([json.loads(l)[sys.argv[1]] for l in sys.stdin if l.strip().startswith('{') and sys.argv[1] in l][-1])" "$1"; }

echo "== scarb build =="
scarb build >/dev/null

echo "== declare + deploy verifier =="
V_CLASS=$("${SNCAST[@]}" declare --url "$SN_RPC" --contract-name Groth16VerifierBN254 --json | jqf class_hash)
V_ADDR=$("${SNCAST[@]}" deploy --url "$SN_RPC" --class-hash "$V_CLASS" --json | jqf contract_address)
echo "   verifier class=$V_CLASS addr=$V_ADDR"

echo "== declare + deploy pool =="
# ctor: (l1_pool: felt, asset: ContractAddress, withdrawal_verifier: ContractAddress, max_relay_fee_bps: u256[low,high])
P_CLASS=$("${SNCAST[@]}" declare --url "$SN_RPC" --contract-name StarknetPrivacyPool --json | jqf class_hash)
P_ADDR=$("${SNCAST[@]}" deploy --url "$SN_RPC" --class-hash "$P_CLASS" \
  --constructor-calldata "$L1_POOL_ADDRESS" "$SN_ASSET_ADDRESS" "$V_ADDR" "$MAX_BPS" 0 --json | jqf contract_address)
echo "   pool class=$P_CLASS addr=$P_ADDR"

CHAIN_ID=$("${SNCAST[@]}" call --url "$SN_RPC" --contract-address "$P_ADDR" --function scope --json >/dev/null 2>&1; \
  python3 -c "import urllib.request,json;print(json.load(urllib.request.urlopen(urllib.request.Request('$SN_RPC',json.dumps({'jsonrpc':'2.0','id':1,'method':'starknet_chainId','params':[]}).encode(),{'Content-Type':'application/json'})))['result'])")
SCOPE=$("${SNCAST[@]}" call --url "$SN_RPC" --contract-address "$P_ADDR" --function scope --json | jqf response 2>/dev/null || echo "")

mkdir -p deployments
OUT="deployments/starknet-${CHAIN_ID}.json"
python3 - "$OUT" "$CHAIN_ID" "$V_ADDR" "$P_ADDR" "$SN_ASSET_ADDRESS" "$L1_POOL_ADDRESS" "$V_CLASS" "$P_CLASS" <<'PY'
import json,sys
out,chain,v,p,asset,l1,vc,pc=sys.argv[1:9]
json.dump({"chainId":chain,"contracts":[
 {"name":"Groth16VerifierBN254","address":v,"classHash":vc},
 {"name":"StarknetPrivacyPool","address":p,"classHash":pc,"asset":asset,"l1Pool":l1},
]}, open(out,"w"), indent=2)
print("wrote",out)
PY

if [ "${SN_VERIFY_FIXTURE:-0}" = "1" ]; then
  echo "== on-chain groth16 verify (view call, free) =="
  CALLDATA=$(python3 -c "import re;print(' '.join(re.findall(r'-?\d+', open('$ROOT/spike/fixtures/calldata_array.txt').read())))")
  "${SNCAST[@]}" call --url "$SN_RPC" --contract-address "$V_ADDR" \
    --function verify_groth16_proof_bn254 --calldata $CALLDATA
fi

echo
echo "DEPLOYED verifier=$V_ADDR pool=$P_ADDR (l2PoolFelt for L1 setBridgeConfig)"
