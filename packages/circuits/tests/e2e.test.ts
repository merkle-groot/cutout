import { WitnessTester } from "circomkit";
import { circomkit, hashCommitment, randomBigInt, padSiblings } from "./common";
import { getBabyjub, hashL2Commitment, viewTag, l2Nullifier, type Babyjub, type Point } from "./common/stealth";
import { poseidon } from "../../../node_modules/maci-crypto/build/ts/hashing.js";
import { parseEther } from "viem";
import { LeanIMT } from "@zk-kit/lean-imt";

/**
 * Phase 4 (T4.1) — Full Mode-3 flow:
 *   deposit → withdrawL1 (mint C_dest) → recipient scan (viewTag + v·E) →
 *   derive stealth key → withdrawL2 (spend).
 *
 * The point of this test: the recipient reconstructs the note using ONLY its own
 * keys (v, b) and the public ephemeral E — no sender secrets — and lands on the
 * exact leaf that withdrawL1 produced and that withdrawL2 spends.
 */
describe("End-to-end Mode-3 flow", () => {
  const maxTreeDepth = 32;
  const hash = (a: bigint, b: bigint) => poseidon([a, b]);

  let bj: Babyjub;
  let withdrawL1: WitnessTester<
    string[],
    ["newCommitmentHashL1", "newCommitmentHashL2", "existingNullifierHash"]
  >;
  let withdrawL2: WitnessTester<string[], ["existingNullifierHash"]>;

  // Recipient long-term keys.
  const b = 424242424242n; // spend
  const v = 191919191919n; // view
  let B: Point;
  let V: Point;

  before(async () => {
    bj = await getBabyjub();
    B = bj.derivePublicKey(b);
    V = bj.derivePublicKey(v);
    withdrawL1 = await circomkit.WitnessTester("withdrawL1", {
      file: "withdrawL1",
      template: "WithdrawL1",
      params: [maxTreeDepth],
      pubs: ["withdrawnValue", "stateRoot", "stateTreeDepth", "ASPRoot", "ASPTreeDepth", "context", "bridgedValue"],
    });
    withdrawL2 = await circomkit.WitnessTester("withdrawL2", {
      file: "withdrawL2",
      template: "WithdrawL2",
      params: [maxTreeDepth],
      pubs: ["noteValue", "stateRoot", "stateTreeDepth", "context"],
    });
  });

  it("T4.1 delivers a spendable note the recipient recovers from (v, b, E) alone", async () => {
    const withdrawnValue = parseEther("1");

    // ---- Sender side ----
    const e = 777777777777n; // fresh ephemeral
    const E = bj.derivePublicKey(e); // published with the note
    const ssX_sender = bj.computeSharedSecretX(e, V); // e·V
    const P_sender = bj.stealthPubKey(B, ssX_sender);
    const cDest = hashL2Commitment(P_sender, withdrawnValue, ssX_sender);

    // ---- L1: deposit + withdrawL1 ----
    const LABEL = randomBigInt();
    const deposit = { value: parseEther("5"), label: LABEL, nullifier: randomBigInt(), secret: randomBigInt() };
    const [depositHash, depositNullifierHash] = hashCommitment(deposit);

    const stateTree = new LeanIMT(hash);
    const ASPTree = new LeanIMT(hash);
    stateTree.insert(randomBigInt());
    stateTree.insert(randomBigInt());
    stateTree.insert(randomBigInt());
    stateTree.insert(depositHash); // index 3
    ASPTree.insert(randomBigInt());
    ASPTree.insert(randomBigInt());
    ASPTree.insert(randomBigInt());
    ASPTree.insert(LABEL); // index 3

    const stateProof = stateTree.generateProof(3);
    const ASPProof = ASPTree.generateProof(3);
    const newNullifier = randomBigInt();
    const newSecret = randomBigInt();

    await withdrawL1.expectPass(
      {
      withdrawnValue,
      bridgedValue: withdrawnValue,
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
        sharedSecretX: ssX_sender,
        newNullifier,
        newSecret,
        stateSiblings: padSiblings(stateProof.siblings, maxTreeDepth),
        stateIndex: stateProof.index,
        ASPSiblings: padSiblings(ASPProof.siblings, maxTreeDepth),
        ASPIndex: ASPProof.index,
      },
      {
        newCommitmentHashL1: hashCommitment({
          value: deposit.value - withdrawnValue,
          label: LABEL,
          nullifier: newNullifier,
          secret: newSecret,
        })[0],
        newCommitmentHashL2: cDest,
        existingNullifierHash: depositNullifierHash,
      },
    );

    // ---- Recipient scan: uses ONLY (v, b) and the public E ----
    const ssX_recip = bj.computeSharedSecretX(v, E); // v·E
    if (ssX_recip !== ssX_sender) throw new Error("ECDH mismatch: recipient cannot derive shared secret");
    if (viewTag(ssX_recip) !== viewTag(ssX_sender)) throw new Error("view tag does not match; scan would skip note");

    const sk = bj.stealthPrivKey(b, ssX_recip);
    const P_recip = bj.derivePublicKey(sk);
    const reconstructed = hashL2Commitment(P_recip, withdrawnValue, ssX_recip);
    if (reconstructed !== cDest) throw new Error("recipient reconstructed a different leaf than withdrawL1 produced");

    // ---- L2: insert C_dest, spend via withdrawL2 ----
    const l2Tree = new LeanIMT(hash);
    l2Tree.insert(randomBigInt());
    l2Tree.insert(randomBigInt());
    l2Tree.insert(cDest); // index 2
    const l2Proof = l2Tree.generateProof(2);

    await withdrawL2.expectPass(
      {
        noteValue: withdrawnValue,
        stateRoot: l2Proof.root,
        stateTreeDepth: l2Tree.depth,
        context: randomBigInt(),
        stealthPrivateKey: sk,
        sharedSecretX: ssX_recip,
        stateSiblings: padSiblings(l2Proof.siblings, maxTreeDepth),
        stateIndex: l2Proof.index,
      },
      { existingNullifierHash: l2Nullifier(sk, cDest) },
    );
  });
});
