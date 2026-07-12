// Step 2: build the Mode-3 withdrawL1 proof against live state, post the ASP root,
// and call relay() on the L1 pool (burns note, bridges ETH to OP Sepolia + note message).
import { createWalletClient, createPublicClient, http, parseAbi, encodeAbiParameters, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import fs from 'fs';
import { groth16 } from 'snarkjs';
import {
  F, getBabyjub, hashL2Commitment, viewTag, padSiblings, LeanIMT, leanHash, nullifierHash, rand,
} from './lib.mjs';

const RPC = 'https://sepolia.drpc.org';
const PK = '0xa444d7d9c4ccd73b150eb4f6e58545b11d071862a88535bfb07c4a42966bbf88';
const POOL = '0xd2709ad0e3d2af2ca9429a94232255fa6f54e473';
const EP = '0xfA1B3a3bAB430c19d6c83d8f3F1619bDdCbddcdd';
const DEST_CHAIN = 11155420n;
const WASM = 'build/withdrawL1/withdrawL1_js/withdrawL1.wasm';
const ZKEY = 'build/withdrawL1/groth16_pkey.zkey';
const VKEY = JSON.parse(fs.readFileSync('build/withdrawL1/groth16_vkey.json'));

// recipient shielded address keys (fixed test vectors) + sender ephemeral
const b = 987654321098765n, v = 123456789012345n, e = 555555555555n;

const d = JSON.parse(fs.readFileSync('/tmp/e2e_deposit.json'));
const label = BigInt(d.label), existingValue = BigInt(d.valueAfterFee);
const existingNullifier = BigInt(d.nullifier), existingSecret = BigInt(d.secret);
const commitment = BigInt(d.commitment);

const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });

const poolAbi = parseAbi([
  'function SCOPE() view returns (uint256)',
  'function currentRoot() view returns (uint256)',
  'function relay((uint256 chainId, bytes data) _withdrawal, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[10] pubSignals) _proof) payable',
  'event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)',
  'event Withdrawn(uint256 _newCommitmentHashL1, uint256 _newComitmentHashL2, uint256 _value, uint256 _spentNullifier)',
  'event L2Note(uint256 indexed _newCommitmentHashL2, uint256[2] _ephemeralKey, bytes1 indexed _viewTag)',
]);

// Reconstruct the pool's LeanIMT state tree from all inserted leaves, in insertion order:
// deposits insert `_commitment`; each relay inserts the L1 change note `_newCommitmentHashL1`.
async function getEventsChunked(eventName, fromBlock, toBlock, step = 100n) {
  const out = [];
  for (let f = fromBlock; f <= toBlock; f += step) {
    const t = f + step - 1n > toBlock ? toBlock : f + step - 1n;
    const evs = await pub.getContractEvents({ address: POOL, abi: poolAbi, eventName, fromBlock: f, toBlock: t });
    out.push(...evs);
  }
  return out;
}
async function buildStateTree() {
  const latest = await pub.getBlockNumber();
  const fromBlock = latest - 400n;
  const deps = await getEventsChunked('Deposited', fromBlock, latest);
  const wds = await getEventsChunked('Withdrawn', fromBlock, latest);
  const events = [];
  for (const e of deps) events.push({ bn: e.blockNumber, li: e.logIndex, leaf: e.args._commitment });
  for (const e of wds) events.push({ bn: e.blockNumber, li: e.logIndex, leaf: e.args._newCommitmentHashL1 });
  events.sort((a, b) => a.bn === b.bn ? a.li - b.li : Number(a.bn - b.bn));
  const tree = new LeanIMT(leanHash);
  for (const ev of events) tree.insert(ev.leaf);
  return tree;
}
const epAbi = parseAbi([
  'function updateRoot(uint256 _root, string _ipfsCID) returns (uint256)',
  'function latestRoot() view returns (uint256)',
]);

const bj = await getBabyjub();
const B = bj.derivePublicKey(b);
const V = bj.derivePublicKey(v);
const E = bj.derivePublicKey(e);
const ssX = bj.computeSharedSecretX(e, V); // sender: e·V
const P = bj.stealthPubKey(B, ssX);
const withdrawnValue = existingValue; // full withdrawal, change note value 0
const cDest = hashL2Commitment(P, withdrawnValue, ssX);
const vt = viewTag(ssX);
console.log('B:', B.map(String));
console.log('E (ephemeralKey):', E.map(String));
console.log('ssX:', ssX.toString());
console.log('C_dest:', cDest.toString(), 'viewTag:', vt.toString());

const SCOPE = await pub.readContract({ address: POOL, abi: poolAbi, functionName: 'SCOPE' });

// ---- ASP tree: single leaf = label ----
const aspTree = new LeanIMT(leanHash);
aspTree.insert(label);
const aspProof = aspTree.generateProof(0);
console.log('\nASP root:', aspTree.root.toString(), 'depth:', aspTree.depth);

// post ASP root (postman = deployer)
const upHash = await wallet.writeContract({ address: EP, abi: epAbi, functionName: 'updateRoot', args: [aspTree.root, 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco'] });
await pub.waitForTransactionReceipt({ hash: upHash });
const latest = await pub.readContract({ address: EP, abi: epAbi, functionName: 'latestRoot' });
console.log('updateRoot tx:', upHash, ' latestRoot:', latest.toString(), ' match:', latest === aspTree.root);

// ---- state tree: reconstruct from on-chain leaves, find our commitment ----
const stateTree = await buildStateTree();
const onchainStateRoot = await pub.readContract({ address: POOL, abi: poolAbi, functionName: 'currentRoot' });
const leafIndex = stateTree.indexOf(commitment);
console.log('\nstate tree size:', stateTree.size, 'depth:', stateTree.depth, 'our leaf index:', leafIndex);
console.log('local root == on-chain root:', stateTree.root === onchainStateRoot);
if (stateTree.root !== onchainStateRoot) throw new Error('reconstructed state tree root mismatch');
const stateProof = stateTree.generateProof(leafIndex);

// ---- context = keccak256(abi.encode(Withdrawal, SCOPE)) % F ----
const relayData = encodeAbiParameters(
  [{ type: 'tuple', components: [
    { name: 'recipient', type: 'address' },
    { name: 'feeRecipient', type: 'address' },
    { name: 'ephemeralKey', type: 'uint256[2]' },
    { name: 'viewTag', type: 'bytes1' },
    { name: 'relayFeeBPS', type: 'uint256' },
  ]}],
  [{ recipient: account.address, feeRecipient: account.address, ephemeralKey: [E[0], E[1]], viewTag: toHex(vt, { size: 1 }), relayFeeBPS: 0n }],
);
const withdrawal = { chainId: DEST_CHAIN, data: relayData };
const encodedForContext = encodeAbiParameters(
  [ { type: 'tuple', components: [ { name: 'chainId', type: 'uint256' }, { name: 'data', type: 'bytes' } ] }, { type: 'uint256' } ],
  [ withdrawal, SCOPE ],
);
const context = BigInt(keccak256(encodedForContext)) % F;
console.log('context:', context.toString());

// ---- witness inputs ----
const newNullifier = rand(), newSecret = rand();
const input = {
  withdrawnValue: withdrawnValue,
  bridgedValue: withdrawnValue,
  stateRoot: stateProof.root,
  stateTreeDepth: BigInt(stateTree.depth),
  ASPRoot: aspProof.root,
  ASPTreeDepth: BigInt(aspTree.depth),
  context,
  label, existingValue, existingNullifier, existingSecret,
  spendingPublicKey: [B[0], B[1]],
  sharedSecretX: ssX,
  newNullifier, newSecret,
  stateSiblings: padSiblings(stateProof.siblings, 32),
  stateIndex: BigInt(stateProof.index || 0),
  ASPSiblings: padSiblings(aspProof.siblings, 32),
  ASPIndex: BigInt(aspProof.index || 0),
};

console.log('\ngenerating withdrawL1 proof ...');
const { proof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
console.log('publicSignals:', publicSignals);
const ok = await groth16.verify(VKEY, publicSignals, proof);
console.log('local verify:', ok);
if (!ok) throw new Error('proof failed local verification');

// sanity: pubSignals mapping
console.log('  [0] newCommitmentHashL1:', publicSignals[0]);
console.log('  [1] newCommitmentHashL2 (C_dest):', publicSignals[1], ' expected:', cDest.toString(), ' match:', BigInt(publicSignals[1]) === cDest);
console.log('  [2] existingNullifierHash:', publicSignals[2], ' expected:', nullifierHash(existingNullifier).toString());
console.log('  [8] context:', publicSignals[8], ' match:', BigInt(publicSignals[8]) === context);

// ---- format solidity calldata ----
const cd = await groth16.exportSolidityCallData(proof, publicSignals);
const [pA, pB, pC, pubSignals] = JSON.parse('[' + cd + ']');
const proofArg = {
  pA: pA.map(BigInt), pB: pB.map(r => r.map(BigInt)), pC: pC.map(BigInt), pubSignals: pubSignals.map(BigInt),
};

fs.writeFileSync('/tmp/e2e_relay.json', JSON.stringify({
  cDest: cDest.toString(), ephemeralKey: E.map(String), viewTag: vt.toString(),
  b: b.toString(), v: v.toString(), e: e.toString(), ssX: ssX.toString(),
  withdrawnValue: withdrawnValue.toString(),
}, null, 2));

console.log('\nsending relay() ...');
const relayHash = await wallet.writeContract({
  address: POOL, abi: poolAbi, functionName: 'relay', args: [withdrawal, proofArg], value: 0n,
  gas: 3_000_000n, // OP messenger sendMessage under-estimates via eth_estimateGas
});
console.log('relay tx:', relayHash);
const rcpt = await pub.waitForTransactionReceipt({ hash: relayHash });
console.log('relay status:', rcpt.status, 'gasUsed:', rcpt.gasUsed.toString());
