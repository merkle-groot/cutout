import { describe, it, expect } from "vitest";
import {
  hashPrecommitment,
  getCommitment,
  generateMerkleProof,
  calculateContext,
  calculateRelayContext,
  encodeRelayData,
  encodeL2RelayData,
  generateMasterKeys,
  generateDepositSecrets,
  generateWithdrawalSecrets,
} from "../../src/crypto.js";
import { poseidon } from "maci-crypto/build/ts/hashing.js";
import { Hash, Secret } from "../../src/types/commitment.js";
import {
  getAddress,
  Hex,
  keccak256,
  decodeAbiParameters,
  toHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, generateMnemonic, english } from "viem/accounts";
import { SNARK_SCALAR_FIELD } from "../../src/constants.js";
import { Withdrawal, RelayWithdrawal, RelayData } from "../../src/index.js";

const mnemonic = generateMnemonic(english);

describe("Crypto Utilities", () => {

  describe("hashPrecommitment", () => {
    it("computes Poseidon hash of nullifier and secret", () => {
      const nullifier = BigInt(123) as Secret;
      const secret = BigInt(456) as Secret;

      const hash = hashPrecommitment(nullifier, secret);
      const expectedHash = poseidon([nullifier, secret]);

      expect(hash).toEqual(expectedHash);
    });
  });

  describe("getCommitment", () => {
    it("creates a valid commitment", () => {
      const value = BigInt(1000);
      const label = BigInt(42);
      const keys = generateMasterKeys(mnemonic);
      const { nullifier, secret } = generateDepositSecrets(keys, BigInt("0x5678") as Hash, BigInt(1));

      const commitment = getCommitment(value, label, nullifier, secret);

      expect(commitment.hash).toBeDefined();
      expect(commitment.nullifierHash).toBeDefined();
      expect(commitment.preimage.value).toBe(value);
      expect(commitment.preimage.label).toBe(label);
    });

    it("throws error for zero nullifier", () => {
      expect(() =>
        getCommitment(
          BigInt(1000),
          BigInt(42),
          BigInt(0) as Secret,
          BigInt(123) as Secret,
        ),
      ).toThrow("Invalid input: 'nullifier' cannot be zero.");
    });

    it("throws error for zero label", () => {
      expect(() =>
        getCommitment(
          BigInt(1000),
          BigInt(0),
          BigInt(123) as Secret,
          BigInt(456) as Secret,
        ),
      ).toThrow("Invalid input: 'label' cannot be zero.");
    });

    it("throws error for zero secret", () => {
      expect(() =>
        getCommitment(
          BigInt(1000),
          BigInt(42),
          BigInt(123) as Secret,
          BigInt(0) as Secret,
        ),
      ).toThrow("Invalid input: 'secret' cannot be zero.");
    });
  });

  describe("generateMerkleProof", () => {
    it("generates Merkle proof for existing leaf", () => {
      const leaves = [BigInt(1), BigInt(2), BigInt(3), BigInt(4)];

      const targetLeaf = BigInt(3);
      const proof = generateMerkleProof(leaves, targetLeaf);

      expect(proof).toHaveProperty("root");
      expect(proof).toHaveProperty("leaf", targetLeaf);
      expect(proof).toHaveProperty("index");
      expect(proof).toHaveProperty("siblings");
    });

    it("throws error for non-existent leaf", () => {
      const leaves = [BigInt(1), BigInt(2), BigInt(4)];

      expect(() => {
        generateMerkleProof(leaves, BigInt(3));
      }).toThrow("Leaf not found in the leaves array.");
    });
  });

  describe("calculateContext", () => {
    it("calculates the context correctly", () => {
      const withdrawal = {
        processooor: getAddress("0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"),
        data: "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000c350" as Hex,
      };
      expect(
        calculateContext(
          withdrawal,
          BigInt(
            "0x0555c5fdc167f1f1519c1b21a690de24d9be5ff0bde19447a5f28958d9256e50",
          ) as Hash,
        ),
      ).toStrictEqual(
        "0x266f59df0823b7efe6821eba38eb5de1177c6366a214b59f12154cd16079965a",
      );
    });

    it("calculates returns a scalar field bounded value", () => {
      const withdrawal: Withdrawal = {
        processooor: privateKeyToAccount(generatePrivateKey()).address,
        data: keccak256(generatePrivateKey()),
      };
      const result = calculateContext(
        withdrawal,
        BigInt(keccak256(generatePrivateKey())) as Hash,
      );
      expect(BigInt(result) % SNARK_SCALAR_FIELD).toStrictEqual(BigInt(result));
    });
  });

  describe("calculateRelayContext (Mode-3 L1 leg)", () => {
    const relayData: RelayData = {
      recipient: getAddress("0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"),
      feeRecipient: getAddress("0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"),
      ephemeralKey: [123n, 456n],
      viewTag: toHex(7n, { size: 1 }),
      relayFeeBPS: 0n,
    };
    const scope = BigInt(
      "0x0555c5fdc167f1f1519c1b21a690de24d9be5ff0bde19447a5f28958d9256e50",
    ) as Hash;

    it("returns a scalar-field bounded value", () => {
      const withdrawal: RelayWithdrawal = {
        chainId: 11155420n,
        data: encodeRelayData(relayData),
      };
      const result = calculateRelayContext(withdrawal, scope);
      expect(BigInt(result) % SNARK_SCALAR_FIELD).toStrictEqual(BigInt(result));
    });

    it("does NOT collide with the L2 (processooor) context shape", () => {
      // chainId (uint256) and processooor (address) live in structurally
      // different tuples; a swap must produce a different hash.
      const data = encodeRelayData(relayData);
      const relay = calculateRelayContext({ chainId: 11155420n, data }, scope);
      const l2 = calculateContext(
        {
          processooor: getAddress(
            "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
          ),
          data,
        },
        scope,
      );
      expect(relay).not.toStrictEqual(l2);
    });
  });

  describe("relay data encoding", () => {
    it("encodeRelayData round-trips the L1 payload", () => {
      const data: RelayData = {
        recipient: getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
        feeRecipient: getAddress(
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        ),
        ephemeralKey: [
          19277813829384n,
          88123098120938102938n,
        ],
        viewTag: toHex(200n, { size: 1 }),
        relayFeeBPS: 250n,
      };
      const encoded = encodeRelayData(data);
      const [decoded] = decodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "feeRecipient", type: "address" },
              { name: "ephemeralKey", type: "uint256[2]" },
              { name: "viewTag", type: "bytes1" },
              { name: "relayFeeBPS", type: "uint256" },
            ],
          },
        ],
        encoded,
      );
      expect(decoded.recipient).toStrictEqual(data.recipient);
      expect(decoded.feeRecipient).toStrictEqual(data.feeRecipient);
      expect(decoded.ephemeralKey).toStrictEqual(data.ephemeralKey);
      expect(decoded.viewTag).toStrictEqual(data.viewTag);
      expect(decoded.relayFeeBPS).toStrictEqual(data.relayFeeBPS);
    });

    it("encodeL2RelayData round-trips the L2 payload", () => {
      const data = {
        recipient: getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
        feeRecipient: getAddress(
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        ),
        relayFeeBPS: 100n,
      };
      const encoded = encodeL2RelayData(data);
      const [decoded] = decodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "feeRecipient", type: "address" },
              { name: "relayFeeBPS", type: "uint256" },
            ],
          },
        ],
        encoded,
      );
      expect(decoded.recipient).toStrictEqual(data.recipient);
      expect(decoded.feeRecipient).toStrictEqual(data.feeRecipient);
      expect(decoded.relayFeeBPS).toStrictEqual(data.relayFeeBPS);
    });
  });
});

describe("Master Key Generation", () => {
  it("generates deterministic master keys from a seed", () => {
    const keys1 = generateMasterKeys(mnemonic);
    const keys2 = generateMasterKeys(mnemonic);

    expect(keys1.masterNullifier).toBeDefined();
    expect(keys1.masterSecret).toBeDefined();
    expect(keys1).toEqual(keys2); // Same seed should produce same keys
    expect(keys1.masterNullifier).not.toEqual(keys1.masterSecret); // Keys should be different
  });

  it("generates keys within SNARK scalar field", () => {
    const keys = generateMasterKeys(mnemonic);
    
    expect(BigInt(keys.masterNullifier) < SNARK_SCALAR_FIELD).toBe(true);
    expect(BigInt(keys.masterSecret) < SNARK_SCALAR_FIELD).toBe(true);
  });
});

describe("Deposit Secrets Generation", () => {
  it("generates deterministic deposit secrets", () => {
    const keys = generateMasterKeys(mnemonic);
    const scope = BigInt("0x5678") as Hash;
    const index = BigInt(1);

    const secrets1 = generateDepositSecrets(keys, scope, index);
    const secrets2 = generateDepositSecrets(keys, scope, index);

    expect(secrets1.nullifier).toBeDefined();
    expect(secrets1.secret).toBeDefined();
    expect(secrets1).toEqual(secrets2); // Same inputs should produce same secrets
  });

  it("generates different secrets for different indices", () => {
    const keys = generateMasterKeys(mnemonic);
    const scope = BigInt("0x5678") as Hash;
    
    const secrets1 = generateDepositSecrets(keys, scope, BigInt(1));
    const secrets2 = generateDepositSecrets(keys, scope, BigInt(2));

    expect(secrets1.nullifier).not.toEqual(secrets2.nullifier);
    expect(secrets1.secret).not.toEqual(secrets2.secret);
  });

  it("generates different secrets for different scopes", () => {
    const keys = generateMasterKeys(mnemonic);
    const index = BigInt(1);
    
    const secrets1 = generateDepositSecrets(keys, BigInt("0x5678") as Hash, index);
    const secrets2 = generateDepositSecrets(keys, BigInt("0x9abc") as Hash, index);

    expect(secrets1.nullifier).not.toEqual(secrets2.nullifier);
    expect(secrets1.secret).not.toEqual(secrets2.secret);
  });
});

describe("Withdrawal Secrets Generation", () => {
  it("generates deterministic withdrawal secrets", () => {
    const keys = generateMasterKeys(mnemonic);
    const label = BigInt("0x5678") as Hash;
    const index = BigInt(1);

    const secrets1 = generateWithdrawalSecrets(keys, label, index);
    const secrets2 = generateWithdrawalSecrets(keys, label, index);

    expect(secrets1.nullifier).toBeDefined();
    expect(secrets1.secret).toBeDefined();
    expect(secrets1).toEqual(secrets2); // Same inputs should produce same secrets
  });

  it("generates different secrets for different indices", () => {
    const keys = generateMasterKeys(mnemonic);
    const label = BigInt("0x5678") as Hash;
    
    const secrets1 = generateWithdrawalSecrets(keys, label, BigInt(1));
    const secrets2 = generateWithdrawalSecrets(keys, label, BigInt(2));

    expect(secrets1.nullifier).not.toEqual(secrets2.nullifier);
    expect(secrets1.secret).not.toEqual(secrets2.secret);
  });

  it("generates different secrets for different labels", () => {
    const keys = generateMasterKeys(mnemonic);
    const index = BigInt(1);
    
    const secrets1 = generateWithdrawalSecrets(keys, BigInt("0x5678") as Hash, index);
    const secrets2 = generateWithdrawalSecrets(keys, BigInt("0x9abc") as Hash, index);

    expect(secrets1.nullifier).not.toEqual(secrets2.nullifier);
    expect(secrets1.secret).not.toEqual(secrets2.secret);
  });
});
