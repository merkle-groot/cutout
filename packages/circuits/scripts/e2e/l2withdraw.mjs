// Step 3 (L2): activate the bridged note, then spend it with a real withdrawL2 proof,
// exiting its full value to a clear recipient on OP Sepolia.
import { createWalletClient, createPublicClient, http, parseAbi, encodeAbiParameters, keccak256, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { optimismSepolia } from 'viem/chains';
import fs from 'fs';
import { groth16 } from 'snarkjs';
import { F, getBabyjub, l2Nullifier, padSiblings, LeanIMT, leanHash } from './lib.mjs';

const L2_RPC = 'https://optimism-sepolia.drpc.org';
const PK = '0xa444d7d9c4ccd73b150eb4f6e58545b11d071862a88535bfb07c4a42966bbf88';
const L2POOL = '0x643aa915d2416118905618f109f6b639c904710a';
const RECIPIENT = '0x00000000000000000000000000000000DeaDBeef'; // clear exit recipient (checked by balance delta)
const WASM = 'build/withdrawL2/withdrawL2_js/withdrawL2.wasm';
const ZKEY = 'build/withdrawL2/groth16_pkey.zkey';
const VKEY = JSON.parse(fs.readFileSync('build/withdrawL2/groth16_vkey.json'));

const r = JSON.parse(fs.readFileSync('/tmp/e2e_relay.json'));
const cDest = BigInt(r.cDest);
const b = BigInt(r.b), ssX = BigInt(r.ssX);
const noteValue = BigInt(r.withdrawnValue);

const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain: optimismSepolia, transport: http(L2_RPC) });
const pub = createPublicClient({ chain: optimismSepolia, transport: http(L2_RPC) });

const abi = parseAbi([
  'function SCOPE() view returns (uint256)',
  'function currentRoot() view returns (uint256)',
  'function activatedSupply() view returns (uint256)',
  'function tokensReceivedFromBridge() view returns (uint256)',
  'function receivedCommitments(uint256) view returns (bool)',
  'function pendingValue(uint256) view returns (uint256)',
  'function nullifierHashes(uint256) view returns (bool)',
  'function activateNote(uint256 _commitmentHash)',
  'function withdraw((address processooor, bytes data) _withdrawal, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[5] pubSignals) _proof)',
  'event NoteReceived(uint256 indexed _commitment, uint256 _value)',
  'event NoteActivated(uint256 indexed _commitment, uint256 _value)',
  'event Withdrawn(address indexed _recipient, uint256 _spentNullifier, uint256 _value, uint256 _feeAmount)',
]);

const bj = await getBabyjub();
const sk = bj.stealthPrivKey(b, ssX);
const nullifier = l2Nullifier(sk, cDest);

// ---- 1. ensure note is activated (tokens landed) ----
const received = await pub.readContract({ address: L2POOL, abi, functionName: 'receivedCommitments', args: [cDest] });
const pending = await pub.readContract({ address: L2POOL, abi, functionName: 'pendingValue', args: [cDest] });
const supplyBefore = await pub.readContract({ address: L2POOL, abi, functionName: 'activatedSupply' });
console.log('note received:', received, ' pendingValue:', formatEther(pending), ' activatedSupply:', formatEther(supplyBefore));
if (!received) throw new Error('note not yet received on L2 — OP relay still pending');
if (pending > 0n) {
  console.log('activating note ...');
  const h = await wallet.writeContract({ address: L2POOL, abi, functionName: 'activateNote', args: [cDest], gas: 500000n });
  const rc = await pub.waitForTransactionReceipt({ hash: h });
  console.log('activateNote tx:', h, 'status:', rc.status);
}

// ---- 2. rebuild L2 state tree from NoteActivated events ----
const latest = await pub.getBlockNumber();
async function chunked(name, from, to, step = 500n) {
  const out = [];
  for (let f = from; f <= to; f += step) {
    const t = f + step - 1n > to ? to : f + step - 1n;
    out.push(...await pub.getContractEvents({ address: L2POOL, abi, eventName: name, fromBlock: f, toBlock: t }));
  }
  return out;
}
const acts = await chunked('NoteActivated', latest - 400n, latest);
acts.sort((a, c) => a.blockNumber === c.blockNumber ? a.logIndex - c.logIndex : Number(a.blockNumber - c.blockNumber));
let tree = new LeanIMT(leanHash);
for (const a of acts) tree.insert(a.args._commitment);
const onchainRoot = await pub.readContract({ address: L2POOL, abi, functionName: 'currentRoot' });
let idx = tree.indexOf(cDest);
if (idx < 0) {
  // log-index lag: fall back to single-leaf tree (fresh pool, one activated note)
  console.log('note not found in event-reconstructed tree (log lag); falling back to single-leaf');
  tree = new LeanIMT(leanHash);
  tree.insert(cDest);
  idx = 0;
}
console.log('L2 tree size:', tree.size, 'our note index:', idx, ' local root==onchain:', tree.root === onchainRoot);
if (tree.root !== onchainRoot) throw new Error('L2 state tree mismatch (root ' + tree.root + ' vs ' + onchainRoot + ')');
const sp = tree.generateProof(idx);

// ---- 3. context = keccak256(abi.encode(L2Withdrawal, SCOPE)) % F ----
const SCOPE = await pub.readContract({ address: L2POOL, abi, functionName: 'SCOPE' });
const relayData = encodeAbiParameters(
  [{ type: 'tuple', components: [
    { name: 'recipient', type: 'address' }, { name: 'feeRecipient', type: 'address' }, { name: 'relayFeeBPS', type: 'uint256' },
  ]}],
  [{ recipient: RECIPIENT, feeRecipient: account.address, relayFeeBPS: 0n }],
);
const withdrawal = { processooor: account.address, data: relayData };
const encoded = encodeAbiParameters(
  [{ type: 'tuple', components: [{ name: 'processooor', type: 'address' }, { name: 'data', type: 'bytes' }] }, { type: 'uint256' }],
  [withdrawal, SCOPE],
);
const context = BigInt(keccak256(encoded)) % F;

// ---- 4. withdrawL2 proof ----
const input = {
  noteValue, stateRoot: sp.root, stateTreeDepth: BigInt(tree.depth), context,
  stealthPrivateKey: sk, sharedSecretX: ssX,
  stateSiblings: padSiblings(sp.siblings, 32), stateIndex: BigInt(sp.index || 0),
};
console.log('\ngenerating withdrawL2 proof ...');
const { proof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
console.log('publicSignals:', publicSignals);
console.log('  expected nullifier[0]:', nullifier.toString(), ' match:', BigInt(publicSignals[0]) === nullifier);
console.log('  expected noteValue[1]:', noteValue.toString(), ' match:', BigInt(publicSignals[1]) === noteValue);
const ok = await groth16.verify(VKEY, publicSignals, proof);
console.log('local verify:', ok);
if (!ok) throw new Error('withdrawL2 proof failed local verify');

const cd = await groth16.exportSolidityCallData(proof, publicSignals);
const [pA, pB, pC, pubSignals] = JSON.parse('[' + cd + ']');
const proofArg = { pA: pA.map(BigInt), pB: pB.map(x => x.map(BigInt)), pC: pC.map(BigInt), pubSignals: pubSignals.map(BigInt) };

// ---- 5. withdraw ----
const recipBefore = await pub.getBalance({ address: RECIPIENT });
console.log('\nrecipient balance before:', formatEther(recipBefore));
console.log('sending L2 withdraw ...');
const h = await wallet.writeContract({ address: L2POOL, abi, functionName: 'withdraw', args: [withdrawal, proofArg], gas: 800000n });
console.log('withdraw tx:', h);
const rc = await pub.waitForTransactionReceipt({ hash: h });
console.log('withdraw status:', rc.status, 'gasUsed:', rc.gasUsed.toString());
const recipAfter = await pub.getBalance({ address: RECIPIENT });
const spent = await pub.readContract({ address: L2POOL, abi, functionName: 'nullifierHashes', args: [nullifier] });
console.log('recipient balance after:', formatEther(recipAfter), ' delta:', formatEther(recipAfter - recipBefore));
console.log('nullifier spent on L2:', spent);
