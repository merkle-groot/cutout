import { groth16 } from 'snarkjs';
import { getBabyjub, hashL2Commitment, l2Nullifier, padSiblings, LeanIMT, leanHash } from './lib.mjs';
const bj = await getBabyjub();
const b=987654321098765n, v=123456789012345n, e=555555555555n;
const ssX = bj.computeSharedSecretX(e, bj.derivePublicKey(v));
const sk = bj.stealthPrivKey(b, ssX);
const P = bj.derivePublicKey(sk);
const noteValue = 777777n;
const leaf = hashL2Commitment(P, noteValue, ssX);
const t = new LeanIMT(leanHash); t.insert(leaf);
const p = t.generateProof(0);
const input = { noteValue, stateRoot: p.root, stateTreeDepth: BigInt(t.depth), context: 999999n,
  stealthPrivateKey: sk, sharedSecretX: ssX, stateSiblings: padSiblings(p.siblings,32), stateIndex: BigInt(p.index||0) };
const { publicSignals } = await groth16.fullProve(input, 'build/withdrawL2/withdrawL2_js/withdrawL2.wasm', 'build/withdrawL2/groth16_pkey.zkey');
const nul = l2Nullifier(sk, leaf);
publicSignals.forEach((s,i)=>{
  let tag = s===noteValue.toString()?'<= noteValue': s===nul.toString()?'<= NULLIFIER': s===p.root.toString()?'<= stateRoot': s==='999999'?'<= context': s===String(t.depth)?'<= depth':'';
  console.log(`  [${i}] ${s} ${tag}`);
});
