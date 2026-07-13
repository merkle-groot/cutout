/**
 * Starknet-pool spike (step 1): generate a real withdrawL2 Groth16 proof fixture and
 * independently reproduce the LeanIMT BN254-Poseidon root + nullifier that the circuit proves against.
 *
 * Deterministic (no randomness) so the emitted fixture is stable across runs and can be committed
 * as the shared input for the Garaga verifier + Cairo LeanIMT parity checks.
 *
 * Run from packages/circuits:  npx ts-node scripts/gen-withdrawL2-fixture.ts
 */
import * as path from "path";
import * as fs from "fs";
import { groth16 } from "snarkjs";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon } from "../../../node_modules/maci-crypto/build/ts/hashing.js";
import { getBabyjub, hashL2Commitment, l2Nullifier } from "../tests/common/stealth";

const MAX_TREE_DEPTH = 32;
const NOTE_INDEX = 3;

// Fixed secrets (mirror withdrawL2.test.ts) — deterministic on purpose.
const b = 987654321098765n;
const v = 123456789012345n;
const e = 555555555555n;
const noteValue = 1000000000000000000n; // 1 ether
const context = 0x1234567890abcdefn; // stand-in; real pool binds keccak(withdrawal, scope)

// Deterministic filler leaves (replace the test's randomBigInt()).
const fillers = [111111111111n, 222222222222n, 333333333333n];

const hash = (x: bigint, y: bigint): bigint => poseidon([x, y]);

const BUILD = path.resolve(__dirname, "../build/withdrawL2");
const WASM = path.join(BUILD, "withdrawL2_js/withdrawL2.wasm");
const ZKEY = path.join(BUILD, "groth16_pkey.zkey");
const VKEY = path.join(BUILD, "groth16_vkey.json");
const OUT = path.resolve(__dirname, "../../starknet-pool/spike/fixtures");

async function main() {
  const bj = await getBabyjub();
  const ssX = bj.computeSharedSecretX(e, bj.derivePublicKey(v));
  const sk = bj.stealthPrivKey(b, ssX);
  const P = bj.derivePublicKey(sk);
  const leaf = hashL2Commitment(P, noteValue, ssX);

  // Build the L2 state tree exactly as the pool would (LeanIMT, 2-input BN254 Poseidon).
  const tree = new LeanIMT(hash);
  for (const f of fillers) tree.insert(f);
  tree.insert(leaf); // note lands at NOTE_INDEX
  const proof = tree.generateProof(NOTE_INDEX);

  const siblings = [...proof.siblings];
  while (siblings.length < MAX_TREE_DEPTH) siblings.push(0n);

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

  console.log("generating proof...");
  const { proof: gProof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);

  const vkey = JSON.parse(fs.readFileSync(VKEY, "utf8"));
  const ok = await groth16.verify(vkey, publicSignals, gProof);
  if (!ok) throw new Error("snarkjs verification FAILED");

  // ---- Independent parity checks (what the Cairo pool must reproduce) ----
  const expectedNullifier = l2Nullifier(sk, leaf);
  const sig = publicSignals.map((s) => BigInt(s));
  // publicSignals order: [existingNullifierHash, noteValue, stateRoot, stateTreeDepth, context]
  const checks: [string, bigint, bigint][] = [
    ["nullifierHash", sig[0], expectedNullifier],
    ["noteValue", sig[1], noteValue],
    ["stateRoot (LeanIMT root)", sig[2], proof.root],
    ["stateTreeDepth", sig[3], BigInt(tree.depth)],
    ["context", sig[4], context],
  ];
  for (const [name, got, want] of checks) {
    const match = got === want;
    console.log(`  ${match ? "OK " : "BAD"} ${name}: ${got}${match ? "" : ` != ${want}`}`);
    if (!match) throw new Error(`parity check failed: ${name}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "proof.json"), JSON.stringify(gProof, null, 2));
  fs.writeFileSync(path.join(OUT, "public.json"), JSON.stringify(publicSignals, null, 2));
  fs.copyFileSync(VKEY, path.join(OUT, "groth16_vkey.json"));
  fs.writeFileSync(
    path.join(OUT, "meta.json"),
    JSON.stringify(
      {
        note: "withdrawL2 spike fixture; hashing = LeanIMT with 2-input BN254 Poseidon (maci-crypto/circomlib)",
        maxTreeDepth: MAX_TREE_DEPTH,
        noteIndex: NOTE_INDEX,
        fillerLeaves: fillers.map(String),
        noteLeaf: leaf.toString(),
        stealthPrivateKey: sk.toString(),
        sharedSecretX: ssX.toString(),
        leanImtRoot: proof.root.toString(),
        treeDepth: tree.depth,
        nullifierHash: expectedNullifier.toString(),
        publicSignalsOrder: ["existingNullifierHash", "noteValue", "stateRoot", "stateTreeDepth", "context"],
      },
      null,
      2,
    ),
  );

  console.log(`\nsnarkjs verify: OK`);
  console.log(`parity (LeanIMT root + nullifier reproduced independently): OK`);
  console.log(`fixture written to ${OUT}`);
}

main().then(() => process.exit(0));
