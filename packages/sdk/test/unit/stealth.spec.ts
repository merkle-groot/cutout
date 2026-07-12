import { describe, expect, it } from "vitest";
import {
  blinding,
  computeSharedSecretX,
  derivePublicKey,
  destCommitment,
  l2Nullifier,
  stealthPrivKey,
  stealthPubKey,
  SUB_ORDER,
  viewTag,
} from "../../src/stealth.js";

/**
 * Golden vectors captured from the live Sepolia -> OP Sepolia Mode-3 run
 * (packages/circuits/scripts/e2e, /tmp/e2e_relay.json). These assert that the
 * SDK's @zk-kit/baby-jubjub stealth math is byte-identical to the circomlibjs
 * glue that produced a note actually spent on-chain.
 */
const b = 987654321098765n; // recipient spend private key
const v = 123456789012345n; // recipient view private key
const e = 555555555555n; // sender ephemeral scalar
const value = 9900000000000000n; // withdrawnValue (0.0099 ETH)

const LIVE = {
  ssX: 18897635145020452564218331727012369539140015183300467856617066394061569225640n,
  ephemeralKey: [
    21483291316890114242038525212712776655502975038070101140765498023232715720081n,
    13729683677370590690393742920997356640133004071857650214506507367200724366118n,
  ] as const,
  viewTag: 133n,
  cDest:
    13063586506679356839528682234401992657471831094710587869539246894468726810181n,
};

describe("stealth (Baby Jubjub Mode-3 derivation)", () => {
  const B = derivePublicKey(b);
  const V = derivePublicKey(v);
  const E = derivePublicKey(e);

  it("ephemeral key E = e·G matches the live note", () => {
    expect(E[0]).toBe(LIVE.ephemeralKey[0]);
    expect(E[1]).toBe(LIVE.ephemeralKey[1]);
  });

  it("ECDH agrees from both sides: e·V == v·E == live ssX", () => {
    const senderSs = computeSharedSecretX(e, V);
    const recipientSs = computeSharedSecretX(v, E);
    expect(senderSs).toBe(recipientSs);
    expect(senderSs).toBe(LIVE.ssX);
  });

  it("view tag matches the live note", () => {
    expect(viewTag(LIVE.ssX)).toBe(LIVE.viewTag);
    expect(viewTag(LIVE.ssX)).toBeLessThan(256n);
  });

  it("destination commitment C_dest matches the on-chain note", () => {
    const ssX = computeSharedSecretX(e, V);
    const P = stealthPubKey(B, ssX);
    expect(destCommitment(P, value, ssX)).toBe(LIVE.cDest);
  });

  it("recipient recomputes the same P as the sender", () => {
    const senderP = stealthPubKey(B, computeSharedSecretX(e, V));
    const recipientP = stealthPubKey(B, computeSharedSecretX(v, E));
    expect(recipientP[0]).toBe(senderP[0]);
    expect(recipientP[1]).toBe(senderP[1]);
  });

  it("stealth private key is reduced mod L and opens P", () => {
    const ssX = computeSharedSecretX(v, E);
    const sk = stealthPrivKey(b, ssX);
    expect(sk).toBeLessThan(SUB_ORDER);
    // sk·G == P  (the ownership relation withdrawL2 opens)
    const skG = derivePublicKey(sk);
    const P = stealthPubKey(B, ssX);
    expect(skG[0]).toBe(P[0]);
    expect(skG[1]).toBe(P[1]);
  });

  it("blinding is deterministic in ss", () => {
    expect(blinding(LIVE.ssX)).toBe(blinding(LIVE.ssX));
  });

  it("l2Nullifier binds the stealth key to the commitment", () => {
    const ssX = computeSharedSecretX(v, E);
    const sk = stealthPrivKey(b, ssX);
    const n1 = l2Nullifier(sk, LIVE.cDest);
    // deterministic, and different key -> different nullifier
    expect(l2Nullifier(sk, LIVE.cDest)).toBe(n1);
    expect(l2Nullifier(sk + 1n, LIVE.cDest)).not.toBe(n1);
  });
});
