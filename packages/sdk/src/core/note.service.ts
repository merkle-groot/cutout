import {
  computeSharedSecretX,
  destCommitment,
  derivePublicKey,
  l2Nullifier,
  stealthPrivKey,
  stealthPubKey,
  viewTag as computeViewTag,
} from "../stealth.js";
import {
  DestNote,
  ScannableNote,
  ScannedNote,
  ShieldedAddress,
  ShieldedKeys,
} from "../types/stealth.js";

/**
 * Baby Jubjub note construction (sender) and scanning (recipient) for Cutout
 * Mode-3 (CLAUDE.md §4, §8).
 *
 * This service is pure crypto — no chain access. The sender turns a recipient's
 * published `(B, V)` + an ephemeral scalar into everything the `withdrawL1`
 * proof and `RelayData` need; the recipient re-derives the shared secret from
 * its view key and recognises its own notes.
 *
 * Self-bridge is the special case of a third-party send where the sender holds
 * `v` and can skip ECDH/scanning — but the **on-chain footprint stays
 * byte-identical** (CLAUDE.md §9); the divergence lives only in how the wallet
 * calls these functions, never in what they emit.
 */
export class NoteService {
  /**
   * Sender side: build a Mode-3 destination note for recipient `(B, V)`.
   *
   * @param recipient - The recipient's published shielded address `(B, V)`.
   * @param value - Plaintext value to forward (amount privacy is out of scope).
   * @param ephemeralScalar - Fresh ephemeral scalar `e` (single-use per note).
   * @returns The `C_dest`, ephemeral key `E`, view tag, shared secret, and `P`.
   */
  public buildDestNote(
    recipient: ShieldedAddress,
    value: bigint,
    ephemeralScalar: bigint,
  ): DestNote {
    const ephemeralKey = derivePublicKey(ephemeralScalar); // E = e·G
    const sharedSecretX = computeSharedSecretX(ephemeralScalar, recipient.V); // e·V
    const P = stealthPubKey(recipient.B, sharedSecretX);
    const cDest = destCommitment(P, value, sharedSecretX);
    const viewTag = computeViewTag(sharedSecretX);

    return {
      cDest,
      ephemeralKey,
      viewTag,
      sharedSecretX,
      stealthPubKey: P,
      value,
    };
  }

  /**
   * Recipient side: scan candidate notes and return the ones addressed to
   * `keys`, with the material needed to spend them on L2.
   *
   * Two-stage match, mirroring the on-chain scan design:
   *  1. **View-tag pre-filter** — cheap `Poseidon(ss) % 256` comparison using
   *     only the view key `v`; discards the vast majority of notes.
   *  2. **Commitment confirmation** — recompute `P` from the spend key `B` and
   *     `C_dest` from `(P, value, ss)`; keep only exact matches. This rejects
   *     view-tag collisions and any note whose value was tampered with.
   *
   * Only `v` is needed to detect a note; `b` is needed to derive the spend
   * material (`stealthPrivKey`, `nullifier`), so full {@link ShieldedKeys} are
   * required here.
   *
   * @param candidates - On-chain note data to test (see {@link ScannableNote}).
   * @param keys - The recipient's full shielded keypair.
   * @returns The subset addressed to `keys`, each with spend material.
   */
  public scanL2Notes(
    candidates: readonly ScannableNote[],
    keys: ShieldedKeys,
  ): ScannedNote[] {
    const found: ScannedNote[] = [];

    for (const note of candidates) {
      // 1. shared secret from the view key: ss = v·E
      const sharedSecretX = computeSharedSecretX(keys.v, note.ephemeralKey);

      // 1a. view-tag pre-filter (cheap reject)
      if (!viewTagMatches(computeViewTag(sharedSecretX), note.viewTag)) {
        continue;
      }

      // 2. recompute P and C_dest; confirm exact match (rejects collisions +
      //    value tampering, since value is folded into C_dest).
      const P = stealthPubKey(keys.B, sharedSecretX);
      const cDest = destCommitment(P, note.value, sharedSecretX);
      if ((cDest as bigint) !== (note.commitment as bigint)) {
        continue;
      }

      // 3. spend material
      const sk = stealthPrivKey(keys.b, sharedSecretX);
      const nullifier = l2Nullifier(sk, cDest as bigint);

      found.push({
        cDest: note.commitment,
        value: note.value,
        sharedSecretX,
        stealthPrivKey: sk,
        nullifier,
      });
    }

    return found;
  }
}

/**
 * Compare a freshly-derived view tag against the on-chain `bytes1` form. The
 * chain emits the low byte as a hex string (e.g. `"0x07"`); normalise both to a
 * numeric byte before comparing so `"0x7"`/`"0x07"`/`7n` all agree.
 */
function viewTagMatches(derived: bigint, onChain: string | bigint): boolean {
  const onChainByte =
    typeof onChain === "bigint" ? onChain : BigInt(onChain);
  return (derived & 0xffn) === (onChainByte & 0xffn);
}
