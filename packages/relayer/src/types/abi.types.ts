/**
 * ABI layout of the Mode-3 relay `data` payload (`RelayData`), carried in
 * `RelayWithdrawal.data`. Beyond the fee terms it carries the stealth material
 * the recipient scans for (`ephemeralKey`, `viewTag`); mirrors the SDK's
 * `encodeRelayData` and the on-chain struct.
 */
export const RelayDataAbi = [
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
] as const;
