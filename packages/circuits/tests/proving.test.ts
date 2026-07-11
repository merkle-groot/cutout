import { circomkit, hashCommitment, randomBigInt, padSiblings } from "./common";
import { getBabyjub, hashL2Commitment, type Babyjub, type Point } from "./common/stealth";
import { poseidon } from "../../../node_modules/maci-crypto/build/ts/hashing.js";
import { parseEther } from "viem";
import { LeanIMT } from "@zk-kit/lean-imt";

/**
 * Phase 5 (T5.1) — Full Groth16 prove + verify for the two withdraw circuits.
 * Validates the trusted-setup → prove → verify pipeline end to end (not just
 * witness generation). Slow: does a groth16 setup on first run.
 */
describe("Groth16 proving (T5.1)", function () {
  this.timeout(600000);

  const maxTreeDepth = 32;
  const hash = (a: bigint, b: bigint) => poseidon([a, b]);

  let bj: Babyjub;
  const b = 424242424242n;
  const v = 191919191919n;
  const e = 777777777777n;
  let B: Point;
  let ssX: bigint;

  const PTAU = "ptau/powersOfTau28_hez_final_16.ptau";

  before(async () => {
    bj = await getBabyjub();
    B = bj.derivePublicKey(b);
    ssX = bj.computeSharedSecretX(e, bj.derivePublicKey(v));
    // Groth16 trusted setup (one-time) for both circuits.
    for (const c of ["withdrawL1", "withdrawL2"]) {
      await circomkit.compile(c);
      await circomkit.setup(c, PTAU);
    }
  });

  it("withdrawL1 proof verifies (and rejects a tampered public signal)", async () => {
    const tester = await circomkit.ProofTester("withdrawL1", "groth16");

    const LABEL = randomBigInt();
    const deposit = { value: parseEther("5"), label: LABEL, nullifier: randomBigInt(), secret: randomBigInt() };
    const [depositHash] = hashCommitment(deposit);

    const stateTree = new LeanIMT(hash);
    const ASPTree = new LeanIMT(hash);
    [randomBigInt(), randomBigInt(), randomBigInt(), depositHash].forEach((x) => stateTree.insert(x));
    [randomBigInt(), randomBigInt(), randomBigInt(), LABEL].forEach((x) => ASPTree.insert(x));
    const sp = stateTree.generateProof(3);
    const ap = ASPTree.generateProof(3);

    const input = {
      withdrawnValue: parseEther("1"),
      stateRoot: sp.root,
      stateTreeDepth: stateTree.depth,
      ASPRoot: ap.root,
      ASPTreeDepth: ASPTree.depth,
      context: randomBigInt(),
      label: LABEL,
      existingValue: deposit.value,
      existingNullifier: deposit.nullifier,
      existingSecret: deposit.secret,
      spendingPublicKey: B,
      sharedSecretX: ssX,
      newNullifier: randomBigInt(),
      newSecret: randomBigInt(),
      stateSiblings: padSiblings(sp.siblings, maxTreeDepth),
      stateIndex: sp.index,
      ASPSiblings: padSiblings(ap.siblings, maxTreeDepth),
      ASPIndex: ap.index,
    };

    const { proof, publicSignals } = await tester.prove(input);
    await tester.expectPass(proof, publicSignals);

    // Tamper a public signal → verification must fail.
    const tampered = [...publicSignals];
    tampered[0] = (BigInt(tampered[0]) + 1n).toString();
    await tester.expectFail(proof, tampered);
  });

  it("withdrawL2 proof verifies", async () => {
    const tester = await circomkit.ProofTester("withdrawL2", "groth16");

    const sk = bj.stealthPrivKey(b, ssX);
    const P = bj.derivePublicKey(sk);
    const noteValue = parseEther("1");
    const leaf = hashL2Commitment(P, noteValue, ssX);

    const stateTree = new LeanIMT(hash);
    [randomBigInt(), randomBigInt(), randomBigInt(), leaf].forEach((x) => stateTree.insert(x));
    const sp = stateTree.generateProof(3);

    const input = {
      noteValue,
      stateRoot: sp.root,
      stateTreeDepth: stateTree.depth,
      context: randomBigInt(),
      stealthPrivateKey: sk,
      sharedSecretX: ssX,
      stateSiblings: padSiblings(sp.siblings, maxTreeDepth),
      stateIndex: sp.index,
    };

    const { proof, publicSignals } = await tester.prove(input);
    await tester.expectPass(proof, publicSignals);
  });
});
