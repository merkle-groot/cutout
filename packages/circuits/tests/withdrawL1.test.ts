import { WitnessTester } from "circomkit";
import { circomkit, hashCommitment, randomBigInt, padSiblings } from "./common";
import { getBabyjub, hashL2Commitment, type Babyjub, type Point } from "./common/stealth";
import { poseidon } from "../../../node_modules/maci-crypto/build/ts/hashing.js";
import { parseEther } from "viem";
import { LeanIMT } from "@zk-kit/lean-imt";

/**
 * Phase 2 (T2.1–T2.5) — WithdrawL1: spend an L1 note, bridge `withdrawnValue` to
 * L2 as a stealth C_dest, and keep the remainder as a fresh L1 change note.
 */
describe("WithdrawL1 Circuit", () => {
  const maxTreeDepth = 32;
  const hash = (a: bigint, b: bigint) => poseidon([a, b]);

  let bj: Babyjub;
  let circuit: WitnessTester<
    string[],
    ["newCommitmentHashL1", "newCommitmentHashL2", "existingNullifierHash"]
  >;

  // Recipient keys + sender ephemeral (fixed vectors).
  const b = 987654321098765n;
  const v = 123456789012345n;
  const e = 555555555555n;
  let B: Point;
  let ssX: bigint;

  // Deposit note (L1).
  const LABEL = randomBigInt();
  const deposit = {
    value: parseEther("5"),
    label: LABEL,
    nullifier: randomBigInt(),
    secret: randomBigInt(),
  };
  const [depositHash, depositNullifierHash] = hashCommitment(deposit);

  let stateTree: LeanIMT<bigint>;
  let ASPTree: LeanIMT<bigint>;

  before(async () => {
    bj = await getBabyjub();
    B = bj.derivePublicKey(b);
    ssX = bj.computeSharedSecretX(e, bj.derivePublicKey(v));
    circuit = await circomkit.WitnessTester("withdrawL1", {
      file: "withdrawL1",
      template: "WithdrawL1",
      params: [maxTreeDepth],
      pubs: ["withdrawnValue", "stateRoot", "stateTreeDepth", "ASPRoot", "ASPTreeDepth", "context"],
    });
  });

  beforeEach(() => {
    stateTree = new LeanIMT(hash);
    ASPTree = new LeanIMT(hash);
    // deposit at index 3 of state tree; label at index 3 of ASP tree
    stateTree.insert(randomBigInt());
    stateTree.insert(randomBigInt());
    stateTree.insert(randomBigInt());
    stateTree.insert(depositHash);
    ASPTree.insert(randomBigInt());
    ASPTree.insert(randomBigInt());
    ASPTree.insert(randomBigInt());
    ASPTree.insert(LABEL);
  });

  // Build a fully-valid input for a given withdrawn value + fresh change keys.
  function buildInput(withdrawnValue: bigint, newNullifier: bigint, newSecret: bigint) {
    const stateProof = stateTree.generateProof(3);
    const ASPProof = ASPTree.generateProof(3);
    return {
      withdrawnValue,
      stateRoot: stateProof.root,
      stateTreeDepth: stateTree.depth,
      ASPRoot: ASPProof.root,
      ASPTreeDepth: ASPTree.depth,
      context: randomBigInt(),
      label: LABEL,
      existingValue: deposit.value,
      existingNullifier: deposit.nullifier,
      existingSecret: deposit.secret,
      spendingPublicKey: B,
      sharedSecretX: ssX,
      newNullifier,
      newSecret,
      stateSiblings: padSiblings(stateProof.siblings, maxTreeDepth),
      stateIndex: stateProof.index,
      ASPSiblings: padSiblings(ASPProof.siblings, maxTreeDepth),
      ASPIndex: ASPProof.index,
    };
  }

  function expectedOutputs(withdrawnValue: bigint, newNullifier: bigint, newSecret: bigint) {
    const remainingValue = deposit.value - withdrawnValue;
    const [changeHash] = hashCommitment({
      value: remainingValue,
      label: LABEL,
      nullifier: newNullifier,
      secret: newSecret,
    });
    const P = bj.stealthPubKey(B, ssX);
    return {
      newCommitmentHashL1: changeHash,
      newCommitmentHashL2: hashL2Commitment(P, withdrawnValue, ssX),
      existingNullifierHash: depositNullifierHash,
    };
  }

  it("T2.1/T2.2 partial withdrawal passes with correct outputs and conservation", async () => {
    const newNullifier = randomBigInt();
    const newSecret = randomBigInt();
    const withdrawnValue = parseEther("1");

    // Conservation (JS side): withdrawn + change == existing.
    const remaining = deposit.value - withdrawnValue;
    if (withdrawnValue + remaining !== deposit.value) throw new Error("conservation broken");

    await circuit.expectPass(
      buildInput(withdrawnValue, newNullifier, newSecret),
      expectedOutputs(withdrawnValue, newNullifier, newSecret),
    );
  });

  it("T2.3 full withdrawal: change note commits value 0", async () => {
    const newNullifier = randomBigInt();
    const newSecret = randomBigInt();
    const withdrawnValue = deposit.value; // remaining == 0
    await circuit.expectPass(
      buildInput(withdrawnValue, newNullifier, newSecret),
      expectedOutputs(withdrawnValue, newNullifier, newSecret),
    );
  });

  it("T2.4 value binding: C_dest tracks the public withdrawnValue", async () => {
    const newNullifier = randomBigInt();
    const newSecret = randomBigInt();
    const withdrawnValue = parseEther("2");
    const input = buildInput(withdrawnValue, newNullifier, newSecret);

    // Expected outputs but with C_dest built from the WRONG value must be rejected.
    const wrong = expectedOutputs(withdrawnValue, newNullifier, newSecret);
    const P = bj.stealthPubKey(B, ssX);
    wrong.newCommitmentHashL2 = hashL2Commitment(P, deposit.value, ssX); // wrong value

    let threw = false;
    try {
      await circuit.expectPass(input, wrong);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("C_dest not bound to withdrawnValue");
  });

  describe("T2.5 negatives", () => {
    it("fails if existing commitment is not in the state tree", async () => {
      const input = buildInput(parseEther("1"), randomBigInt(), randomBigInt());
      input.stateRoot = randomBigInt(); // wrong root
      await circuit.expectFail(input);
    });

    it("fails if label is not in the ASP tree", async () => {
      // Rebuild ASP tree without LABEL.
      ASPTree = new LeanIMT(hash);
      ASPTree.insert(randomBigInt());
      ASPTree.insert(randomBigInt());
      ASPTree.insert(randomBigInt());
      ASPTree.insert(randomBigInt()); // not LABEL
      const input = buildInput(parseEther("1"), randomBigInt(), randomBigInt());
      await circuit.expectFail(input);
    });

    it("fails if the change note reuses the spent nullifier", async () => {
      const input = buildInput(parseEther("1"), deposit.nullifier, randomBigInt());
      await circuit.expectFail(input);
    });

    it("fails on over-withdrawal (withdrawnValue > existingValue)", async () => {
      const input = buildInput(deposit.value + parseEther("1"), randomBigInt(), randomBigInt());
      await circuit.expectFail(input);
    });

    it("fails on an invalid tree depth", async () => {
      const input = buildInput(parseEther("1"), randomBigInt(), randomBigInt());
      input.stateTreeDepth = maxTreeDepth + 5; // > maxDepth
      await circuit.expectFail(input);
    });
  });
});
