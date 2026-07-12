import {
  Base8,
  addPoint,
  mulPointEscalar,
  subOrder,
} from "@zk-kit/baby-jubjub";
import { poseidon } from "maci-crypto/build/ts/hashing.js";
import { Hash, Secret } from "./types/commitment.js";
import { Point } from "./types/stealth.js";

/**
 * Baby Jubjub stealth derivation for Cutout Mode-3 notes.
 *
 * Curve + hash are forced (Baby Jubjub + Poseidon) because the spend key
 * authorizes a commitment *opening* in-circuit — it does not sign a transaction
 * (CLAUDE.md §8). All Poseidon hashing goes through `maci-crypto`, which is
 * value-identical to the on-chain `poseidon-solidity` (validated empirically),
 * so commitments computed here match what the circuits and pool contracts hash.
 *
 * Parity note: byte-identical to `packages/circuits/scripts/e2e/lib.mjs`
 * (circomlibjs) and to the live Sepolia -> OP Sepolia run.
 */

/** The Baby Jubjub prime-order subgroup order `L`. Scalars reduce mod this. */
export const SUB_ORDER: bigint = subOrder;

/** Poseidon over a bigint tuple, matching the circuit/on-chain hasher. */
function H(inputs: bigint[]): bigint {
  return poseidon(inputs) as unknown as bigint;
}

/**
 * Derive a Baby Jubjub public key from a private scalar: `pub = sk·G`.
 * Used for spend key `B = b·G`, view key `V = v·G`, ephemeral `E = e·G`.
 */
export function derivePublicKey(privateKey: bigint): Point {
  const [x, y] = mulPointEscalar(Base8, privateKey);
  return [x, y];
}

/**
 * The shared-secret x-coordinate via ECDH.
 * Sender computes `ss = e·V`; recipient recomputes the same value as `v·E`.
 */
export function computeSharedSecretX(scalar: bigint, point: Point): bigint {
  return mulPointEscalar([point[0], point[1]], scalar)[0];
}

/**
 * One-time owner key `P = B + Poseidon(ss)·G`.
 * Remains an opaque witness on-chain; a botched derivation only griefs the
 * sender, it never threatens pool soundness.
 */
export function stealthPubKey(B: Point, sharedSecretX: bigint): Point {
  const t = mulPointEscalar(Base8, H([sharedSecretX]));
  const [x, y] = addPoint([B[0], B[1]], t);
  return [x, y];
}

/**
 * One-time spend scalar `sk = (b + Poseidon(ss)) mod L`.
 * The recipient opens the Poseidon ownership constraint with this inside
 * `withdrawL2` — never as an Ethereum signature.
 */
export function stealthPrivKey(b: bigint, sharedSecretX: bigint): Secret {
  return ((b + H([sharedSecretX])) % subOrder) as Secret;
}

/** Blinding factor `r = Poseidon(ss, 1)`. */
export function blinding(sharedSecretX: bigint): bigint {
  return H([sharedSecretX, 1n]);
}

/**
 * Destination commitment `C_dest = Poseidon(P.x, P.y, value, Poseidon(ss, 1))`.
 * This is the bridged L2 note (`newCommitmentHashL2` in `withdrawL1`).
 */
export function destCommitment(
  P: Point,
  value: bigint,
  sharedSecretX: bigint,
): Hash {
  return H([P[0], P[1], value, blinding(sharedSecretX)]) as Hash;
}

/**
 * View tag = low byte of `Poseidon(ss)`. Cheap pre-filter for recipient scans.
 */
export function viewTag(sharedSecretX: bigint): bigint {
  return H([sharedSecretX]) % 256n;
}

/**
 * L2 nullifier `Poseidon(sk, commitment)` — what spending a stealth note burns.
 */
export function l2Nullifier(stealthPrivKey: bigint, commitment: bigint): Hash {
  return H([stealthPrivKey, commitment]) as Hash;
}
