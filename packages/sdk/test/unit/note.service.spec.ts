import { describe, expect, it } from "vitest";
import { NoteService } from "../../src/core/note.service.js";
import {
  derivePublicKey,
  stealthPrivKey,
  l2Nullifier,
  computeSharedSecretX,
} from "../../src/stealth.js";
import { toHex } from "viem";
import { Hash } from "../../src/types/commitment.js";
import {
  ScannableNote,
  ShieldedAddress,
  ShieldedKeys,
} from "../../src/types/stealth.js";

/**
 * Same golden vectors as stealth.spec — captured from the live Sepolia -> OP
 * Sepolia Mode-3 run. Here they exercise the sender/recipient note flow through
 * NoteService end to end.
 */
const b = 987654321098765n; // recipient spend private key
const v = 123456789012345n; // recipient view private key
const e = 555555555555n; // sender ephemeral scalar
const value = 9900000000000000n;

const LIVE = {
  ephemeralKey: [
    21483291316890114242038525212712776655502975038070101140765498023232715720081n,
    13729683677370590690393742920997356640133004071857650214506507367200724366118n,
  ] as const,
  viewTag: 133n,
  cDest:
    13063586506679356839528682234401992657471831094710587869539246894468726810181n,
};

const B = derivePublicKey(b);
const V = derivePublicKey(v);

const recipientAddress: ShieldedAddress = { B, V };
const recipientKeys: ShieldedKeys = {
  b: b as ShieldedKeys["b"],
  B,
  v: v as ShieldedKeys["v"],
  V,
};

describe("NoteService", () => {
  const service = new NoteService();

  describe("buildDestNote (sender)", () => {
    it("reproduces the live on-chain note", () => {
      const note = service.buildDestNote(recipientAddress, value, e);
      expect(note.ephemeralKey[0]).toBe(LIVE.ephemeralKey[0]);
      expect(note.ephemeralKey[1]).toBe(LIVE.ephemeralKey[1]);
      expect(note.viewTag).toBe(LIVE.viewTag);
      expect(note.cDest as bigint).toBe(LIVE.cDest);
      expect(note.value).toBe(value);
    });
  });

  describe("scanL2Notes (recipient)", () => {
    const toScannable = (
      note: ReturnType<NoteService["buildDestNote"]>,
    ): ScannableNote => ({
      commitment: note.cDest,
      ephemeralKey: note.ephemeralKey,
      viewTag: toHex(note.viewTag, { size: 1 }),
      value: note.value,
    });

    it("recognises a note addressed to the recipient and derives spend material", () => {
      const note = service.buildDestNote(recipientAddress, value, e);
      const found = service.scanL2Notes([toScannable(note)], recipientKeys);

      expect(found).toHaveLength(1);
      expect(found[0]!.cDest as bigint).toBe(LIVE.cDest);
      expect(found[0]!.value).toBe(value);

      // spend material matches the direct stealth derivation
      const ssX = computeSharedSecretX(v, note.ephemeralKey);
      const sk = stealthPrivKey(b, ssX);
      expect(found[0]!.stealthPrivKey as bigint).toBe(sk as bigint);
      expect(found[0]!.nullifier as bigint).toBe(
        l2Nullifier(sk, LIVE.cDest) as bigint,
      );
    });

    it("ignores notes addressed to a different recipient", () => {
      // sender builds a note for a DIFFERENT recipient
      const otherB = derivePublicKey(111n);
      const otherV = derivePublicKey(222n);
      const note = service.buildDestNote({ B: otherB, V: otherV }, value, e);

      const found = service.scanL2Notes(
        [toScannable(note)],
        recipientKeys,
      );
      expect(found).toHaveLength(0);
    });

    it("rejects a note whose value was tampered with (view-tag survives, commitment fails)", () => {
      const note = service.buildDestNote(recipientAddress, value, e);
      const tampered: ScannableNote = {
        ...toScannable(note),
        value: value + 1n, // view tag unaffected, but C_dest no longer matches
      };
      const found = service.scanL2Notes([tampered], recipientKeys);
      expect(found).toHaveLength(0);
    });

    it("filters mixed candidates, returning only the recipient's notes", () => {
      const mine = service.buildDestNote(recipientAddress, value, e);
      const theirs = service.buildDestNote(
        { B: derivePublicKey(333n), V: derivePublicKey(444n) },
        value,
        777n,
      );
      const decoy: ScannableNote = {
        commitment: 42n as Hash,
        ephemeralKey: derivePublicKey(999n),
        viewTag: "0x00",
        value,
      };

      const found = service.scanL2Notes(
        [toScannable(theirs), toScannable(mine), decoy],
        recipientKeys,
      );
      expect(found).toHaveLength(1);
      expect(found[0]!.cDest as bigint).toBe(LIVE.cDest);
    });

    it("self-bridge is the same path (recipient == holder of v)", () => {
      // Self-bridge: the sender holds v and authors a note to their own (B, V).
      // Footprint is byte-identical; scanning still recognises it.
      const note = service.buildDestNote(recipientAddress, value, e);
      const found = service.scanL2Notes([toScannable(note)], recipientKeys);
      expect(found).toHaveLength(1);
    });
  });
});
