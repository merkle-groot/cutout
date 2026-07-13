/**
 * Starknet full-flow fixture: a withdrawL2 proof whose `context` is the BN254-Poseidon fold the
 * Starknet pool computes (not the EVM keccak), against a FIXED scope. The snforge full-flow test
 * `store()`s this scope into the deployed pool so the proof's context matches on-chain.
 *
 * Run from packages/circuits:  npx ts-node scripts/gen-withdrawL2-starknet-fixture.ts
 */
import * as path from "path";
import * as fs from "fs";
import { groth16 } from "snarkjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon } from "../../../node_modules/maci-crypto/build/ts/hashing.js";
import { getBabyjub, hashL2Commitment, l2Nullifier } from "../tests/common/stealth";

const MAX_TREE_DEPTH = 32;
const NOTE_INDEX = 3;

const b = 987654321098765n;
const v = 123456789012345n;
const e = 555555555555n;
const noteValue = 1000000000000000000n; // 1e18

const fillers = [111111111111n, 222222222222n, 333333333333n];

// Fixed Starknet withdrawal + scope (chosen; the test forces `scope` into the pool via store()).
const SCOPE = 12345678901234567890n;
const withdrawal = {
  processooor: 0xa11cen, // relayer / caller
  recipient: 0xb0bn,
  feeRecipient: 0xfeen,
  relayFeeBPS: 100n, // 1%
};

/** Left-fold of 2-input BN254 Poseidon — must match SDK poseidonFold and Cairo poseidon_fold. */
function poseidonFold(inputs: bigint[]): bigint {
  let acc = poseidon([inputs[0], inputs[1]]);
  for (let i = 2; i < inputs.length; i++) acc = poseidon([acc, inputs[i]]);
  return acc;
}

const hash = (x: bigint, y: bigint): bigint => poseidon([x, y]);

const BUILD = path.resolve(__dirname, "../build/withdrawL2");
const WASM = path.join(BUILD, "withdrawL2_js/withdrawL2.wasm");
const ZKEY = path.join(BUILD, "groth16_pkey.zkey");
const VKEY = path.join(BUILD, "groth16_vkey.json");
const OUT = path.resolve(__dirname, "../../starknet-pool/tests/fixtures");

async function main() {
  const bj = await getBabyjub();
  const ssX = bj.computeSharedSecretX(e, bj.derivePublicKey(v));
  const sk = bj.stealthPrivKey(b, ssX);
  const P = bj.derivePublicKey(sk);
  const leaf = hashL2Commitment(P, noteValue, ssX);

  const tree = new LeanIMT(hash);
  for (const f of fillers) tree.insert(f);
  tree.insert(leaf);
  const proof = tree.generateProof(NOTE_INDEX);

  const siblings = [...proof.siblings];
  while (siblings.length < MAX_TREE_DEPTH) siblings.push(0n);

  const context = poseidonFold([
    withdrawal.processooor,
    withdrawal.recipient,
    withdrawal.feeRecipient,
    withdrawal.relayFeeBPS,
    SCOPE,
  ]);

  const input = {
    noteValue,
    stateRoot: proof.root,
    stateTreeDepth: tree.depth,
    context,
    stealthPrivateKey: sk,
    sharedSecretX: ssX,
    stateSiblings: siblings,
    stateIndex: proof.index,
  };

  const { proof: gProof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
  const vkey = JSON.parse(fs.readFileSync(VKEY, "utf8"));
  if (!(await groth16.verify(vkey, publicSignals, gProof))) throw new Error("verify failed");

  const sig = publicSignals.map((s) => BigInt(s));
  if (sig[4] !== context) throw new Error("context mismatch in public signals");

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "proof.json"), JSON.stringify(gProof, null, 2));
  fs.writeFileSync(path.join(OUT, "public.json"), JSON.stringify(publicSignals, null, 2));
  fs.copyFileSync(VKEY, path.join(OUT, "groth16_vkey.json"));
  fs.writeFileSync(
    path.join(OUT, "meta.json"),
    JSON.stringify(
      {
        note: "withdrawL2 Starknet full-flow fixture; context = poseidonFold([processooor,recipient,feeRecipient,relayFeeBPS,scope])",
        scope: SCOPE.toString(),
        withdrawal: {
          processooor: withdrawal.processooor.toString(),
          recipient: withdrawal.recipient.toString(),
          feeRecipient: withdrawal.feeRecipient.toString(),
          relayFeeBPS: withdrawal.relayFeeBPS.toString(),
        },
        context: context.toString(),
        noteValue: noteValue.toString(),
        leaves: [...fillers.map(String), leaf.toString()],
        leanImtRoot: proof.root.toString(),
        treeDepth: tree.depth,
        nullifierHash: l2Nullifier(sk, leaf).toString(),
      },
      null,
      2,
    ),
  );

  console.log("context =", context.toString());
  console.log("root    =", proof.root.toString());
  console.log("nullifier =", l2Nullifier(sk, leaf).toString());
  console.log("fixture written to", OUT);
}

main().then(() => process.exit(0));
