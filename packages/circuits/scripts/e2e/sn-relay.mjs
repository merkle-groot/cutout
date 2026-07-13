// Stage 3b: build the Mode-3 withdrawL1 proof and relay() to Starknet Sepolia.
// Burns the L1 note, bridges ETH via StarkGate + sends the C_dest note message via Starknet Core.
import { createWalletClient, createPublicClient, http, parseAbi, encodeAbiParameters, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import fs from 'fs';
import { groth16 } from 'snarkjs';
import { F, getBabyjub, hashL2Commitment, viewTag, padSiblings, LeanIMT, leanHash, nullifierHash, rand } from './lib.mjs';

const RPC = 'https://sepolia.gateway.tenderly.co';       // reads
const WRITE_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'; // sends ok (getLogs blocked)
const PK = '0xa444d7d9c4ccd73b150eb4f6e58545b11d071862a88535bfb07c4a42966bbf88';
const POOL = '0x2e302A22FC09516e64fC44ADb2f527939c5fBB6D';
const EP = '0xfA1B3a3bAB430c19d6c83d8f3F1619bDdCbddcdd';
const DEST_CHAIN = 393402133025997798000961n; // SN_SEPOLIA felt as uint
const MSG_VALUE = 11000000000000000n;          // messageFee(1e16)+tokenFee(1e14)+buffer
const WASM = 'build/withdrawL1/withdrawL1_js/withdrawL1.wasm';
const ZKEY = 'build/withdrawL1/groth16_pkey.zkey';
const VKEY = JSON.parse(fs.readFileSync('build/withdrawL1/groth16_vkey.json'));

// recipient shielded address keys (fixed test vectors, same as the withdrawL2 fixture) + sender ephemeral
const b = 987654321098765n, v = 123456789012345n, e = 555555555555n;

const d = JSON.parse(fs.readFileSync('/tmp/sn_deposit.json'));
const label = BigInt(d.label), existingValue = BigInt(d.valueAfterFee);
const existingNullifier = BigInt(d.nullifier), existingSecret = BigInt(d.secret);
const commitment = BigInt(d.commitment);

const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(WRITE_RPC) });
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });

const poolAbi = parseAbi([
  'function SCOPE() view returns (uint256)',
  'function currentRoot() view returns (uint256)',
  'function relay((uint256 chainId, bytes data) _withdrawal, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[10] pubSignals) _proof) payable',
  'event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)',
  'event Withdrawn(uint256 _newCommitmentHashL1, uint256 _newComitmentHashL2, uint256 _value, uint256 _spentNullifier)',
]);
const epAbi = parseAbi([
  'function updateRoot(uint256 _root, string _ipfsCID) returns (uint256)',
  'function latestRoot() view returns (uint256)',
]);

async function getEventsChunked(eventName, fromBlock, toBlock, step = 100n) {
  const out = [];
  for (let f = fromBlock; f <= toBlock; f += step) {
    const t = f + step - 1n > toBlock ? toBlock : f + step - 1n;
    out.push(...await pub.getContractEvents({ address: POOL, abi: poolAbi, eventName, fromBlock: f, toBlock: t }));
  }
  return out;
}
async function buildStateTree() {
  const latest = await pub.getBlockNumber();
  const fromBlock = latest - 400n;
  const deps = await getEventsChunked('Deposited', fromBlock, latest);
  const wds = await getEventsChunked('Withdrawn', fromBlock, latest);
  const events = [];
  for (const ev of deps) events.push({ bn: ev.blockNumber, li: ev.logIndex, leaf: ev.args._commitment });
  for (const ev of wds) events.push({ bn: ev.blockNumber, li: ev.logIndex, leaf: ev.args._newCommitmentHashL1 });
  events.sort((a, x) => a.bn === x.bn ? a.li - x.li : Number(a.bn - x.bn));
  const tree = new LeanIMT(leanHash);
  for (const ev of events) tree.insert(ev.leaf);
  return tree;
}

const bj = await getBabyjub();
const B = bj.derivePublicKey(b), V = bj.derivePublicKey(v), E = bj.derivePublicKey(e);
const ssX = bj.computeSharedSecretX(e, V);
const P = bj.stealthPubKey(B, ssX);
const withdrawnValue = existingValue; // full withdrawal
const cDest = hashL2Commitment(P, withdrawnValue, ssX);
const vt = viewTag(ssX);
console.log('C_dest:', cDest.toString(), 'viewTag:', vt.toString());
console.log('E (ephemeralKey):', E.map(String));

const SCOPE = await pub.readContract({ address: POOL, abi: poolAbi, functionName: 'SCOPE' });

// ASP tree: single leaf = label
const aspTree = new LeanIMT(leanHash);
aspTree.insert(label);
const aspProof = aspTree.generateProof(0);
const upHash = await wallet.writeContract({ address: EP, abi: epAbi, functionName: 'updateRoot', args: [aspTree.root, 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco'] });
await pub.waitForTransactionReceipt({ hash: upHash });
const latestRoot = await pub.readContract({ address: EP, abi: epAbi, functionName: 'latestRoot' });
console.log('ASP root posted:', latestRoot === aspTree.root);

// state tree
const stateTree = await buildStateTree();
const onchainStateRoot = await pub.readContract({ address: POOL, abi: poolAbi, functionName: 'currentRoot' });
if (stateTree.root !== onchainStateRoot) throw new Error('state tree root mismatch');
const leafIndex = stateTree.indexOf(commitment);
const stateProof = stateTree.generateProof(leafIndex);
console.log('state tree ok, leaf index', leafIndex);

// context = keccak256(abi.encode(Withdrawal{chainId,data}, SCOPE)) % F  (L1 relay leg)
const relayData = encodeAbiParameters(
  [{ type: 'tuple', components: [
    { name: 'recipient', type: 'address' }, { name: 'feeRecipient', type: 'address' },
    { name: 'ephemeralKey', type: 'uint256[2]' }, { name: 'viewTag', type: 'bytes1' },
    { name: 'relayFeeBPS', type: 'uint256' }] }],
  [{ recipient: account.address, feeRecipient: account.address, ephemeralKey: [E[0], E[1]], viewTag: toHex(vt, { size: 1 }), relayFeeBPS: 0n }],
);
const withdrawal = { chainId: DEST_CHAIN, data: relayData };
const encodedForContext = encodeAbiParameters(
  [{ type: 'tuple', components: [{ name: 'chainId', type: 'uint256' }, { name: 'data', type: 'bytes' }] }, { type: 'uint256' }],
  [withdrawal, SCOPE],
);
const context = BigInt(keccak256(encodedForContext)) % F;

const newNullifier = rand(), newSecret = rand();
const input = {
  withdrawnValue, bridgedValue: withdrawnValue,
  stateRoot: stateProof.root, stateTreeDepth: BigInt(stateTree.depth),
  ASPRoot: aspProof.root, ASPTreeDepth: BigInt(aspTree.depth), context,
  label, existingValue, existingNullifier, existingSecret,
  spendingPublicKey: [B[0], B[1]], sharedSecretX: ssX,
  newNullifier, newSecret,
  stateSiblings: padSiblings(stateProof.siblings, 32), stateIndex: BigInt(stateProof.index || 0),
  ASPSiblings: padSiblings(aspProof.siblings, 32), ASPIndex: BigInt(aspProof.index || 0),
};

console.log('generating withdrawL1 proof ...');
const { proof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
if (!(await groth16.verify(VKEY, publicSignals, proof))) throw new Error('local verify failed');
console.log('  C_dest match:', BigInt(publicSignals[1]) === cDest);

const cd = await groth16.exportSolidityCallData(proof, publicSignals);
const [pA, pB, pC, pubSignals] = JSON.parse('[' + cd + ']');
const proofArg = { pA: pA.map(BigInt), pB: pB.map(r => r.map(BigInt)), pC: pC.map(BigInt), pubSignals: pubSignals.map(BigInt) };

console.log('sending relay() to Starknet, msg.value', MSG_VALUE.toString(), '...');
const relayHash = await wallet.writeContract({
  address: POOL, abi: poolAbi, functionName: 'relay', args: [withdrawal, proofArg], value: MSG_VALUE, gas: 3_000_000n,
});
const rcpt = await pub.waitForTransactionReceipt({ hash: relayHash });
console.log('relay tx:', relayHash, 'status:', rcpt.status, 'gasUsed:', rcpt.gasUsed.toString());

fs.writeFileSync('/tmp/sn_relay.json', JSON.stringify({
  cDest: cDest.toString(), ephemeralKey: E.map(String), viewTag: vt.toString(),
  b: b.toString(), v: v.toString(), e: e.toString(), ssX: ssX.toString(),
  withdrawnValue: withdrawnValue.toString(), relayTx: relayHash, relayBlock: rcpt.blockNumber.toString(),
}, null, 2));
console.log('saved /tmp/sn_relay.json');
