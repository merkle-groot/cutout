// Stage 3c: spend the delivered C_dest note on the Starknet pool.
// Builds a withdrawL2 proof against the live L2 tree (single leaf = C_dest) with the Starknet
// Poseidon-fold context, and writes proof/public + meta for the garaga calldata step.
import fs from 'fs';
import { groth16 } from 'snarkjs';
import { getBabyjub, hashL2Commitment, l2Nullifier, blinding, LeanIMT, leanHash, padSiblings, H } from './lib.mjs';

const WASM = 'build/withdrawL2/withdrawL2_js/withdrawL2.wasm';
const ZKEY = 'build/withdrawL2/groth16_pkey.zkey';
const VKEY = JSON.parse(fs.readFileSync('build/withdrawL2/groth16_vkey.json'));
const OUT = '../starknet-pool/tests/live';

// From the relay + on-chain reads
const r = JSON.parse(fs.readFileSync('/tmp/sn_relay.json'));
const b = BigInt(r.b), ssX = BigInt(r.ssX);
const noteValue = BigInt(r.withdrawnValue);           // 9900000000000000
const cDest = BigInt(r.cDest);
const SN_SCOPE = BigInt(process.env.SN_SCOPE);        // pool.scope() read on-chain

// Starknet withdrawal (felts). processooor must be the tx caller (our sn2 account).
const wd = {
  processooor: BigInt(process.env.PROCESSOOOR),
  recipient: BigInt(process.env.RECIPIENT),
  feeRecipient: BigInt(process.env.FEE_RECIPIENT),
  relayFeeBPS: BigInt(process.env.RELAY_FEE_BPS ?? '0'),
};
const poseidonFold = (xs) => xs.slice(2).reduce((a, x) => H([a, x]), H([xs[0], xs[1]]));
const context = poseidonFold([wd.processooor, wd.recipient, wd.feeRecipient, wd.relayFeeBPS, SN_SCOPE]);

const bj = await getBabyjub();
const sk = bj.stealthPrivKey(b, ssX);
const P = bj.derivePublicKey(sk);
const leaf = hashL2Commitment(P, noteValue, ssX);
if (leaf !== cDest) throw new Error(`recomputed leaf != C_dest (${leaf} vs ${cDest})`);

// single-leaf live tree
const tree = new LeanIMT(leanHash);
tree.insert(leaf);
const proofT = tree.generateProof(0);
if (proofT.root !== cDest) throw new Error('tree root != C_dest');

const input = {
  noteValue,
  stateRoot: proofT.root,
  stateTreeDepth: tree.depth,          // 0
  context,
  stealthPrivateKey: sk,
  sharedSecretX: ssX,
  stateSiblings: padSiblings(proofT.siblings, 32),
  stateIndex: BigInt(proofT.index || 0),
};

console.log('C_dest / root:', cDest.toString());
console.log('context:', context.toString());
console.log('nullifier:', l2Nullifier(sk, leaf).toString());

const { proof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
if (!(await groth16.verify(VKEY, publicSignals, proof))) throw new Error('local verify failed');
// public order: [existingNullifierHash, noteValue, stateRoot, stateTreeDepth, context]
console.log('publicSignals:', publicSignals);
if (BigInt(publicSignals[4]) !== context) throw new Error('context signal mismatch');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/proof.json`, JSON.stringify(proof, null, 2));
fs.writeFileSync(`${OUT}/public.json`, JSON.stringify(publicSignals, null, 2));
fs.copyFileSync('build/withdrawL2/groth16_vkey.json', `${OUT}/groth16_vkey.json`);
fs.writeFileSync(`${OUT}/withdrawal.json`, JSON.stringify({
  processooor: wd.processooor.toString(), recipient: wd.recipient.toString(),
  feeRecipient: wd.feeRecipient.toString(), relayFeeBPS: wd.relayFeeBPS.toString(),
  context: context.toString(), nullifier: l2Nullifier(sk, leaf).toString(), noteValue: noteValue.toString(),
}, null, 2));
console.log('wrote', OUT);
