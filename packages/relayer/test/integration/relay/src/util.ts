import { encodeAbiParameters } from "viem";

// Mode-3 RelayData: fee terms + stealth material (ephemeralKey, viewTag).
const RelayDataAbi = [
  {
    name: "RelayData",
    type: "tuple",
    components: [
      { name: "recipient", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "ephemeralKey", type: "uint256[2]" },
      { name: "viewTag", type: "bytes1" },
      { name: "relayFeeBPS", type: "uint256" },
    ],
  },
];

export function encodeFeeData({
  recipient, feeRecipient, relayFeeBPS,
  ephemeralKey = [0n, 0n], viewTag = "0x00",
}: {
  recipient: `0x${string}`; feeRecipient: `0x${string}`; relayFeeBPS: bigint;
  ephemeralKey?: readonly [bigint, bigint]; viewTag?: `0x${string}`;
}) {
  return encodeAbiParameters(RelayDataAbi, [
    {
      recipient,
      feeRecipient,
      ephemeralKey,
      viewTag,
      relayFeeBPS,
    },
  ]);
}

export function isNative(asset: `0x${string}`) {
  return asset.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}
