import { describe, it, expect } from "vitest";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon } from "maci-crypto/build/ts/hashing.js";
import { toHex } from "viem";
import { DataService } from "../../src/core/data.service.js";
import { NoteService } from "../../src/core/note.service.js";
import { derivePublicKey } from "../../src/stealth.js";
import { Hash } from "../../src/types/commitment.js";
import {
  L2NoteActivatedEvent,
  L2NoteEvent,
  L2NoteReceivedEvent,
} from "../../src/types/events.js";
import { ShieldedKeys } from "../../src/types/stealth.js";

// Pure (network-free) DataService helpers for the Mode-3 L2 flow.
const data = new DataService([
  {
    chainId: 11155420,
    rpcUrl: "http://localhost:0",
    startBlock: 0n,
    privacyPoolAddress: "0x0000000000000000000000000000000000000000",
  },
]);

// live golden recipient/sender vectors (same as stealth.spec / note.service.spec)
const b = 987654321098765n;
const v = 123456789012345n;
const e = 555555555555n;
const value = 9900000000000000n;
const B = derivePublicKey(b);
const V = derivePublicKey(v);
const LIVE_CDEST =
  13063586506679356839528682234401992657471831094710587869539246894468726810181n;

describe("DataService — Mode-3 L2 helpers", () => {
  describe("buildScannableNotes", () => {
    const note = new NoteService().buildDestNote({ B, V }, value, e);

    const l2Notes: L2NoteEvent[] = [
      {
        commitment: note.cDest,
        ephemeralKey: note.ephemeralKey,
        viewTag: toHex(note.viewTag, { size: 1 }),
        blockNumber: 10n,
        transactionHash: "0xaaa",
      },
    ];

    it("joins an L1 delivery with its L2 received value", () => {
      const received: L2NoteReceivedEvent[] = [
        {
          commitment: note.cDest,
          value,
          blockNumber: 20n,
          transactionHash: "0xbbb",
        },
      ];
      const candidates = data.buildScannableNotes(l2Notes, received);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.value).toBe(value);

      // the joined candidate is scannable by the recipient
      const keys: ShieldedKeys = {
        b: b as ShieldedKeys["b"],
        B,
        v: v as ShieldedKeys["v"],
        V,
      };
      const found = new NoteService().scanL2Notes(candidates, keys);
      expect(found).toHaveLength(1);
      expect(found[0]!.cDest as bigint).toBe(LIVE_CDEST);
    });

    it("omits deliveries whose bridged value has not landed yet", () => {
      const candidates = data.buildScannableNotes(l2Notes, []);
      expect(candidates).toHaveLength(0);
    });
  });

  describe("reconstructL2StateTree", () => {
    it("reproduces the on-chain LeanIMT root from insertion-ordered activations", () => {
      const leaves = [111n, 222n, LIVE_CDEST, 444n];
      const activated: L2NoteActivatedEvent[] = leaves.map((c, i) => ({
        commitment: c as Hash,
        value: BigInt(i + 1),
        blockNumber: BigInt(i),
        transactionHash: `0x${i}`,
      }));

      const tree = data.reconstructL2StateTree(activated);

      // Must equal a directly-built Poseidon-2 LeanIMT over the same leaves.
      const reference = new LeanIMT<bigint>((x, y) => poseidon([x, y]));
      reference.insertMany(leaves);

      expect(tree.root).toBe(reference.root);
      expect(tree.indexOf(LIVE_CDEST)).toBe(2);
    });
  });
});
