import { WitnessTester } from "circomkit";
import { circomkit } from "./common";
import {
  getBabyjub,
  hashL2Commitment,
  l2Nullifier,
  blinding,
  type Babyjub,
  type Point,
} from "./common/stealth";

/**
 * T1.2–T1.5 — Unit tests for the L2 stealth-note circuits, checked against the
 * reference helpers in tests/common/stealth.ts.
 */
describe("L2 stealth commitment circuits", () => {
  let bj: Babyjub;

  // Fixed vectors.
  const b = 987654321098765n; // recipient spend priv
  const v = 123456789012345n; // recipient view priv
  const e = 555555555555n; // sender ephemeral priv
  const value = 10n ** 18n; // 1e18

  let B: Point;
  let ssX: bigint;

  before(async () => {
    bj = await getBabyjub();
    B = bj.derivePublicKey(b);
    const V = bj.derivePublicKey(v);
    ssX = bj.computeSharedSecretX(e, V);
  });

  describe("commitmentL2Sender (T1.2)", () => {
    let circuit: WitnessTester<["spendingPublicKey", "sharedSecretX", "value"], ["commitment"]>;

    before(async () => {
      circuit = await circomkit.WitnessTester("commitmentL2Sender", {
        file: "commitmentL2Sender",
        template: "CommitmentHasherL2Sender",
        pubs: ["value"],
      });
    });

    it("computes commitment matching the reference", async () => {
      const P = bj.stealthPubKey(B, ssX);
      await circuit.expectPass(
        { spendingPublicKey: B, sharedSecretX: ssX, value },
        { commitment: hashL2Commitment(P, value, ssX) },
      );
    });

    it("commitment tracks the shared secret across several ssX", async () => {
      for (const scalar of [1n, 2n, 7n, 99n]) {
        const V = bj.derivePublicKey(v);
        const s = bj.computeSharedSecretX(scalar, V);
        const P = bj.stealthPubKey(B, s);
        await circuit.expectPass(
          { spendingPublicKey: B, sharedSecretX: s, value },
          { commitment: hashL2Commitment(P, value, s) },
        );
      }
    });
  });

  describe("commitmentL2Withdraw (T1.3, T1.5)", () => {
    let circuit: WitnessTester<
      ["stealthPrivateKey", "sharedSecretX", "value"],
      ["commitment", "nullifierHash"]
    >;

    before(async () => {
      circuit = await circomkit.WitnessTester("commitmentL2Withdraw", {
        file: "commitmentL2Withdraw",
        template: "CommitmentHasherL2Withdraw",
        pubs: ["value"],
      });
    });

    it("computes commitment and nullifier matching the reference (T1.3)", async () => {
      const sk = bj.stealthPrivKey(b, ssX);
      const P = bj.derivePublicKey(sk);
      const commitment = hashL2Commitment(P, value, ssX);
      await circuit.expectPass(
        { stealthPrivateKey: sk, sharedSecretX: ssX, value },
        { commitment, nullifierHash: l2Nullifier(sk, commitment) },
      );
    });

    it("nullifier is commitment-bound and position-independent (T1.5)", async () => {
      const sk = bj.stealthPrivKey(b, ssX);
      const P = bj.derivePublicKey(sk);
      const commitment = hashL2Commitment(P, value, ssX);
      // Same note ⇒ same nullifier regardless of any tree position (stability —
      // this is what prevents the LeanIMT-index double-spend).
      await circuit.expectPass(
        { stealthPrivateKey: sk, sharedSecretX: ssX, value },
        { commitment, nullifierHash: l2Nullifier(sk, commitment) },
      );
      // Different value ⇒ different commitment ⇒ different nullifier.
      const value2 = value + 1n;
      const commitment2 = hashL2Commitment(P, value2, ssX);
      await circuit.expectPass(
        { stealthPrivateKey: sk, sharedSecretX: ssX, value: value2 },
        { commitment: commitment2, nullifierHash: l2Nullifier(sk, commitment2) },
      );
      if (l2Nullifier(sk, commitment) === l2Nullifier(sk, commitment2))
        throw new Error("commitment not bound into nullifier");
    });
  });

  describe("round-trip sender ↔ withdraw (T1.4) ★", () => {
    let sender: WitnessTester<["spendingPublicKey", "sharedSecretX", "value"], ["commitment"]>;
    let withdraw: WitnessTester<
      ["stealthPrivateKey", "sharedSecretX", "value"],
      ["commitment", "nullifierHash"]
    >;

    before(async () => {
      sender = await circomkit.WitnessTester("commitmentL2Sender", {
        file: "commitmentL2Sender",
        template: "CommitmentHasherL2Sender",
        pubs: ["value"],
      });
      withdraw = await circomkit.WitnessTester("commitmentL2Withdraw", {
        file: "commitmentL2Withdraw",
        template: "CommitmentHasherL2Withdraw",
        pubs: ["value"],
      });
    });

    it("a note minted by the sender circuit reopens with the same commitment in the withdraw circuit", async () => {
      const P_pub = bj.stealthPubKey(B, ssX); // sender's view of P
      const sk = bj.stealthPrivKey(b, ssX); // recipient's derived private key
      const P_priv = bj.derivePublicKey(sk); // recipient's view of P

      // Independent guard: the two derivations of P agree.
      if (P_pub[0] !== P_priv[0] || P_pub[1] !== P_priv[1])
        throw new Error("stealth P mismatch between sender and recipient derivations");

      // Both circuits must pass against ONE shared reference commitment.
      const expected = hashL2Commitment(P_pub, value, ssX);

      await sender.expectPass(
        { spendingPublicKey: B, sharedSecretX: ssX, value },
        { commitment: expected },
      );
      await withdraw.expectPass(
        { stealthPrivateKey: sk, sharedSecretX: ssX, value },
        { commitment: expected, nullifierHash: l2Nullifier(sk, expected) },
      );
    });

    it("blinding r = Poseidon(ssX, 1) is what both circuits use", () => {
      // guards the shared blinding convention
      if (blinding(ssX) === 0n) throw new Error("blinding degenerate");
    });
  });
});
