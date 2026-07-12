import { Hash, Secret } from "./commitment.js";

/**
 * A point on the Baby Jubjub curve, `[x, y]` as field elements.
 * Used for public keys (`B`, `V`), the ephemeral key (`E`), and the one-time
 * owner key (`P`).
 */
export type Point = readonly [bigint, bigint];

/**
 * A recipient's published shielded address — a 5564-*shaped* Baby Jubjub
 * meta-address (NOT an EIP-5564 stealth meta-address: different curve, different
 * hash, no Announcer, no address in the value path).
 *
 * - `B = b·G` — spend public key
 * - `V = v·G` — view public key
 */
export interface ShieldedAddress {
  readonly B: Point;
  readonly V: Point;
}

/**
 * A recipient's full shielded keypair (spend + view). The view key `v` is enough
 * to scan; the spend key `b` is required to open (spend) a received note.
 */
export interface ShieldedKeys {
  readonly b: Secret; // spend private key
  readonly B: Point; // spend public key = b·G
  readonly v: Secret; // view private key
  readonly V: Point; // view public key = v·G
}

/**
 * Everything the sender derives for one Mode-3 destination note, from the
 * recipient's `(B, V)` and a fresh ephemeral scalar `e`.
 */
export interface DestNote {
  /** `C_dest = Poseidon(P.x, P.y, value, Poseidon(ss, 1))` — the bridged L2 note. */
  readonly cDest: Hash;
  /** `E = e·G` — the ephemeral public key carried in the note message. */
  readonly ephemeralKey: Point;
  /** First byte of `Poseidon(ss)` — cheap scan pre-filter. */
  readonly viewTag: bigint;
  /** `ss = e·V` (recipient recomputes `v·E`). */
  readonly sharedSecretX: bigint;
  /** `P = B + Poseidon(ss)·G` — the one-time owner key (opaque witness on-chain). */
  readonly stealthPubKey: Point;
  /** Value forwarded in plaintext (amount privacy is out of scope). */
  readonly value: bigint;
}

/**
 * The minimal on-chain data a recipient needs to test one candidate note during
 * a scan: the delivered commitment, the ephemeral key + view tag from the L1
 * `L2Note` event, and the cleartext `value` (from the L2 `NoteReceived`/
 * `Withdrawn` event). Value is required because `C_dest` folds it in.
 */
export interface ScannableNote {
  readonly commitment: Hash;
  readonly ephemeralKey: Point;
  /** Low byte of `Poseidon(ss)`, as a hex `bytes1` (as emitted on-chain). */
  readonly viewTag: string;
  readonly value: bigint;
}

/**
 * A note the recipient found by scanning, with the material needed to spend it
 * on L2 (open the Poseidon ownership constraint inside `withdrawL2`).
 */
export interface ScannedNote {
  readonly cDest: Hash;
  readonly value: bigint;
  readonly sharedSecretX: bigint;
  /** `sk = (b + Poseidon(ss)) mod L` — the in-circuit spend authorization. */
  readonly stealthPrivKey: Secret;
  /** `Poseidon(sk, C_dest)` — the L2 nullifier this note spends to. */
  readonly nullifier: Hash;
}
