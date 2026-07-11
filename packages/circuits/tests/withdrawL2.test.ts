import { WitnessTester } from "circomkit";
import { circomkit, randomBigInt, padSiblings } from "./common";
import { getBabyjub, hashL2Commitment, l2Nullifier, type Babyjub } from "./common/stealth";
import { poseidon } from "../../../node_modules/maci-crypto/build/ts/hashing.js";
import { parseEther } from "viem";
import { LeanIMT } from "@zk-kit/lean-imt";

/**
 * Phase 3 (T3.1–T3.2) — WithdrawL2: spend a stealth C_dest note on the L2 pool.
 */
describe("WithdrawL2 Circuit", () => {
  const maxTreeDepth = 32;
  const hash = (a: bigint, b: bigint) => poseidon([a, b]);
  const NOTE_INDEX = 3;

  let bj: Babyjub;
  let circuit: WitnessTester<string[], ["existingNullifierHash"]>;

  const b = 987654321098765n;
  const v = 123456789012345n;
  const e = 555555555555n;

  let sk: bigint;
  let ssX: bigint;
  const noteValue = parseEther("1");

  let stateTree: LeanIMT<bigint>;

  before(async () => {
    bj = await getBabyjub();
    ssX = bj.computeSharedSecretX(e, bj.derivePublicKey(v));
    sk = bj.stealthPrivKey(b, ssX);
    circuit = await circomkit.WitnessTester("withdrawL2", {
      file: "withdrawL2",
      template: "WithdrawL2",
      params: [maxTreeDepth],
      pubs: ["noteValue", "stateRoot", "stateTreeDepth", "context"],
    });
  });

  let leaf: bigint;

  beforeEach(() => {
    stateTree = new LeanIMT(hash);
    const P = bj.derivePublicKey(sk);
    leaf = hashL2Commitment(P, noteValue, ssX);
    stateTree.insert(randomBigInt());
    stateTree.insert(randomBigInt());
    stateTree.insert(randomBigInt());
    stateTree.insert(leaf); // note at NOTE_INDEX
  });

  function buildInput() {
    const proof = stateTree.generateProof(NOTE_INDEX);
    return {
      noteValue,
      stateRoot: proof.root,
      stateTreeDepth: stateTree.depth,
      context: randomBigInt(),
      stealthPrivateKey: sk,
      sharedSecretX: ssX,
      stateSiblings: padSiblings(proof.siblings, maxTreeDepth),
      stateIndex: proof.index,
    };
  }

  it("T3.1 spends the note and outputs Poseidon(sk, commitment) as nullifier", async () => {
    await circuit.expectPass(buildInput(), {
      existingNullifierHash: l2Nullifier(sk, leaf),
    });
  });

  describe("T3.2 negatives", () => {
    it("fails with a wrong stealth private key (recomputed leaf not in tree)", async () => {
      const input = buildInput();
      input.stealthPrivateKey = sk + 1n;
      await circuit.expectFail(input);
    });

    it("fails with a wrong leaf index (inclusion path mismatch)", async () => {
      const input = buildInput();
      input.stateIndex = NOTE_INDEX + 1; // siblings are for NOTE_INDEX
      await circuit.expectFail(input);
    });

    it("fails if the note is absent from the tree (wrong root)", async () => {
      const input = buildInput();
      input.stateRoot = randomBigInt();
      await circuit.expectFail(input);
    });

    it("fails on an invalid tree depth", async () => {
      const input = buildInput();
      input.stateTreeDepth = maxTreeDepth + 5;
      await circuit.expectFail(input);
    });
  });
});
