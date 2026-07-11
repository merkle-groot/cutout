/// <reference path="./circomlibjs.d.ts" />
import { buildBabyjub } from "circomlibjs";
import { poseidon } from "../../../../node_modules/maci-crypto/build/ts/hashing.js";

/**
 * Baby Jubjub + stealth-note reference helpers for the L2 circuits.
 *
 * These mirror, in plain JS, exactly what commitmentL2Sender.circom and
 * commitmentL2Withdraw.circom compute, so tests can check the circuit output
 * against an independent implementation.
 */

export type Point = [bigint, bigint];

// Memoized async babyjub instance.
let bjPromise: ReturnType<typeof buildBabyjub> | undefined;
function bjInstance() {
  if (!bjPromise) bjPromise = buildBabyjub();
  return bjPromise;
}

export interface Babyjub {
  L: bigint; // prime subgroup order
  base8: Point;
  mul(p: Point, s: bigint): Point; // scalar multiply
  add(p: Point, q: Point): Point; // point add
  derivePublicKey(sk: bigint): Point; // sk·G (G = Base8)
  computeSharedSecretX(scalar: bigint, point: Point): bigint; // (scalar·point).x
  stealthPubKey(B: Point, ssX: bigint): Point; // P = B + Poseidon(ssX)·G
  stealthPrivKey(b: bigint, ssX: bigint): bigint; // (b + Poseidon(ssX)) mod L
}

export async function getBabyjub(): Promise<Babyjub> {
  const bj = await bjInstance();
  const toBig = (x: unknown) => bj.F.toObject(x as never);
  const toF = (p: Point) => [bj.F.e(p[0]), bj.F.e(p[1])] as const;
  const fromF = (p: readonly unknown[]) => [toBig(p[0]), toBig(p[1])] as Point;

  const base8: Point = [toBig(bj.Base8[0]), toBig(bj.Base8[1])];
  const L: bigint = BigInt(bj.subOrder.toString());

  const mul = (p: Point, s: bigint): Point => fromF(bj.mulPointEscalar(toF(p), s));
  const add = (p: Point, q: Point): Point => fromF(bj.addPoint(toF(p), toF(q)));
  const derivePublicKey = (sk: bigint): Point => mul(base8, sk);
  const computeSharedSecretX = (scalar: bigint, point: Point): bigint => mul(point, scalar)[0];
  const stealthPubKey = (B: Point, ssX: bigint): Point =>
    add(B, mul(base8, poseidon([ssX])));
  const stealthPrivKey = (b: bigint, ssX: bigint): bigint =>
    (b + poseidon([ssX])) % L;

  return { L, base8, mul, add, derivePublicKey, computeSharedSecretX, stealthPubKey, stealthPrivKey };
}

// ---- L2 note reference hashing (must match the circom field ordering) ----

/** r = Poseidon(ssX, 1) — the note blinding. */
export function blinding(ssX: bigint): bigint {
  return poseidon([ssX, BigInt(1)]);
}

/** C_dest = Poseidon(P.x, P.y, value, Poseidon(ssX, 1)). */
export function hashL2Commitment(P: Point, value: bigint, ssX: bigint): bigint {
  return poseidon([P[0], P[1], value, blinding(ssX)]);
}

/** View tag = low byte of Poseidon(ssX) (matches Num2Bits(254) low 8 bits). */
export function viewTag(ssX: bigint): bigint {
  return poseidon([ssX]) % BigInt(256);
}

/** L2 nullifier = Poseidon(stealthPrivateKey, commitment). Position-independent. */
export function l2Nullifier(sk: bigint, commitment: bigint): bigint {
  return poseidon([sk, commitment]);
}
