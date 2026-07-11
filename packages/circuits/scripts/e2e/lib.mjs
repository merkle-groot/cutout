// Shared helpers for the Cutout live E2E (Mode-3) glue.
import { buildBabyjub } from 'circomlibjs';
import { poseidon } from 'maci-crypto/build/ts/hashing.js';
import { LeanIMT } from '@zk-kit/lean-imt';

export const F = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const H = (inputs) => poseidon(inputs.map(BigInt));
export const leanHash = (a, b) => poseidon([a, b]);

// ---- L1 note (Privacy Pools form) ----
export const precommitment = (nullifier, secret) => H([nullifier, secret]);
export const nullifierHash = (nullifier) => H([nullifier]);
export const commitmentHash = (value, label, precom) => H([value, label, precom]);

export function rand() {
  // 31-byte random, safely < F
  let x = 0n;
  const b = crypto.getRandomValues(new Uint8Array(31));
  for (const v of b) x = (x << 8n) | BigInt(v);
  return x;
}

export function padSiblings(siblings, depth) {
  const s = siblings.map(BigInt);
  while (s.length < depth) s.push(0n);
  return s;
}

export { LeanIMT };

// ---- Baby Jubjub stealth (mirrors circuits/tests/common/stealth.ts) ----
export async function getBabyjub() {
  const bj = await buildBabyjub();
  const toBig = (x) => bj.F.toObject(x);
  const toF = (p) => [bj.F.e(p[0]), bj.F.e(p[1])];
  const fromF = (p) => [toBig(p[0]), toBig(p[1])];
  const base8 = [toBig(bj.Base8[0]), toBig(bj.Base8[1])];
  const L = BigInt(bj.subOrder.toString());
  const mul = (p, s) => fromF(bj.mulPointEscalar(toF(p), s));
  const add = (p, q) => fromF(bj.addPoint(toF(p), toF(q)));
  const derivePublicKey = (sk) => mul(base8, sk);
  const computeSharedSecretX = (scalar, point) => mul(point, scalar)[0];
  const stealthPubKey = (B, ssX) => add(B, mul(base8, H([ssX])));
  const stealthPrivKey = (b, ssX) => (b + H([ssX])) % L;
  return { L, base8, mul, add, derivePublicKey, computeSharedSecretX, stealthPubKey, stealthPrivKey };
}

// r = Poseidon(ssX, 1)
export const blinding = (ssX) => H([ssX, 1n]);
// C_dest = Poseidon(P.x, P.y, value, Poseidon(ssX,1))
export const hashL2Commitment = (P, value, ssX) => H([P[0], P[1], value, blinding(ssX)]);
// view tag = low byte of Poseidon(ssX)
export const viewTag = (ssX) => H([ssX]) % 256n;
// L2 nullifier = Poseidon(sk, commitment)
export const l2Nullifier = (sk, commitment) => H([sk, commitment]);
