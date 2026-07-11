import { strict as assert } from "assert";
import {
  getBabyjub,
  hashL2Commitment,
  viewTag,
  l2Nullifier,
  type Babyjub,
  type Point,
} from "./common/stealth";

/**
 * T0.3 — Self-tests for the stealth reference helpers.
 *
 * These do NOT touch any circuit. They assert the JS reference implementation is
 * internally consistent, so that later circuit tests comparing against it are
 * meaningful. The load-bearing identity is:
 *   stealthPubKey(B, ssX) === derivePublicKey(stealthPrivKey(b, ssX))
 */
describe("Stealth helpers (reference self-test)", () => {
  let bj: Babyjub;

  // Fixed vectors for determinism.
  const b = 987654321098765n; // recipient spend priv
  const v = 123456789012345n; // recipient view priv
  const e = 555555555555n; // sender ephemeral priv

  before(async () => {
    bj = await getBabyjub();
  });

  it("ECDH agrees: sender e·V == recipient v·E (x-coordinate)", () => {
    const B = bj.derivePublicKey(b);
    const V = bj.derivePublicKey(v);
    const E = bj.derivePublicKey(e);
    void B;
    const ssX_sender = bj.computeSharedSecretX(e, V);
    const ssX_recip = bj.computeSharedSecretX(v, E);
    assert.equal(ssX_sender, ssX_recip);
  });

  it("★ stealth identity: stealthPubKey(B, ssX) == derivePublicKey(stealthPrivKey(b, ssX))", () => {
    const B = bj.derivePublicKey(b);
    const V = bj.derivePublicKey(v);
    const ssX = bj.computeSharedSecretX(e, V);

    const P_pub: Point = bj.stealthPubKey(B, ssX);
    const sk = bj.stealthPrivKey(b, ssX);
    const P_priv: Point = bj.derivePublicKey(sk);

    assert.equal(P_pub[0], P_priv[0]);
    assert.equal(P_pub[1], P_priv[1]);
  });

  it("note round-trips: sender and withdraw derivations hash to the same commitment", () => {
    const B = bj.derivePublicKey(b);
    const V = bj.derivePublicKey(v);
    const ssX = bj.computeSharedSecretX(e, V);
    const value = 100n;

    const P_pub = bj.stealthPubKey(B, ssX);
    const sk = bj.stealthPrivKey(b, ssX);
    const P_priv = bj.derivePublicKey(sk);

    assert.equal(hashL2Commitment(P_pub, value, ssX), hashL2Commitment(P_priv, value, ssX));
  });

  it("stealthPrivKey is reduced into [0, L)", () => {
    const V = bj.derivePublicKey(v);
    const ssX = bj.computeSharedSecretX(e, V);
    const sk = bj.stealthPrivKey(b, ssX);
    assert.equal(sk >= 0n && sk < bj.L, true);
  });

  it("viewTag is a single byte", () => {
    const V = bj.derivePublicKey(v);
    const ssX = bj.computeSharedSecretX(e, V);
    const tag = viewTag(ssX);
    assert.equal(tag >= 0n && tag < 256n, true);
  });

  it("l2Nullifier is commitment-bound: different commitments ⇒ different nullifiers", () => {
    const V = bj.derivePublicKey(v);
    const ssX = bj.computeSharedSecretX(e, V);
    const sk = bj.stealthPrivKey(b, ssX);
    // stable for the same commitment, distinct for different commitments
    assert.equal(l2Nullifier(sk, 111n), l2Nullifier(sk, 111n));
    assert.notEqual(l2Nullifier(sk, 111n), l2Nullifier(sk, 222n));
  });
});
