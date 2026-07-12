import {
  Address,
  Chain,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  decodeAbiParameters, DecodeAbiParametersErrorType,
  encodeAbiParameters,
  EncodeAbiParametersErrorType,
  BaseError as ViemError
} from "viem";
import {
  ValidationError,
  WithdrawalValidationError,
} from "./exceptions/base.exception.js";
import {
  RelayRequestBody,
  WithdrawPublicSignals,
} from "./interfaces/relayer/request.js";
import { RelayDataAbi } from "./types/abi.types.js";
import { getFeeReceiverAddress, getSignerPrivateKey } from "./config/index.js";
import { privateKeyToAccount } from "viem/accounts";

/**
 * The decoded Mode-3 relay `data` payload. `ephemeralKey`/`viewTag` are the
 * stealth material the recipient scans for; they are fee-irrelevant but part of
 * the on-chain bytes the proof context binds, so they must round-trip exactly.
 */
interface WithdrawalData {
  recipient: Address,
  feeRecipient: Address,
  ephemeralKey: readonly [bigint, bigint],
  viewTag: `0x${string}`,
  relayFeeBPS: bigint;
}

export function decodeWithdrawalData(data: `0x${string}`): WithdrawalData {
  try {
    const [{ recipient, feeRecipient, ephemeralKey, viewTag, relayFeeBPS }] =
      decodeAbiParameters(RelayDataAbi, data);
    return { recipient, feeRecipient, ephemeralKey, viewTag, relayFeeBPS };
  } catch (e) {
    const error = e as DecodeAbiParametersErrorType;
    throw WithdrawalValidationError.invalidWithdrawalAbi({
      name: error.name,
      message: error.message,
    });
  }
}

export function encodeWithdrawalData(withdrawalData: WithdrawalData): `0x${string}` {
  try {
    return encodeAbiParameters(RelayDataAbi, [withdrawalData]);
  } catch (e) {
    const error = e as EncodeAbiParametersErrorType;
    throw WithdrawalValidationError.invalidWithdrawalAbi({
      name: error.name,
      message: error.message,
    });
  }
}

export function parseSignals(
  signals: RelayRequestBody["publicSignals"],
): WithdrawPublicSignals {
  const badSignals = signals
    .map((x, i) => (x === undefined ? i : null))
    .filter((i) => i !== null);
  if (badSignals.length > 0) {
    throw ValidationError.invalidInput({
      details: `Signals ${badSignals.join(", ")} are undefined`,
    });
  }
  /// Mode-3 `withdrawL1` layout (matches the SDK's WITHDRAW_L1_SIGNALS). Circom
  /// emits circuit outputs first: the L1 change note AND the bridged C_dest lead,
  /// so `withdrawnValue`/`context` are shifted vs the old single-output circuit.
  return {
    newCommitmentHashL1: BigInt(signals[0]!), // [0] L1 change-note commitment
    newCommitmentHashL2: BigInt(signals[1]!), // [1] C_dest (bridged L2 note)
    existingNullifierHash: BigInt(signals[2]!), // [2] spent note nullifier
    withdrawnValue: BigInt(signals[3]!), // [3]
    stateRoot: BigInt(signals[4]!), // [4]
    stateTreeDepth: BigInt(signals[5]!), // [5]
    ASPRoot: BigInt(signals[6]!), // [6]
    ASPTreeDepth: BigInt(signals[7]!), // [7]
    context: BigInt(signals[8]!), // [8]
    bridgedValue: BigInt(signals[9]!), // [9] net L2 delivery value
  };
}

/**
 * Creates a Chain object for the given chain configuration
 * 
 * @param {object} chainConfig - The chain configuration
 * @returns {Chain} - The Chain object
 */
export function createChainObject(chainConfig: {
  chain_id: number;
  chain_name: string;
  rpc_url: string;
  native_currency?: { name: string; symbol: string; decimals: number; };
}): Chain {
  return {
    id: chainConfig.chain_id,
    name: chainConfig.chain_name,
    nativeCurrency: chainConfig.native_currency || {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: { http: [chainConfig.rpc_url] },
      public: { http: [chainConfig.rpc_url] },
    },
  };
}

export function isViemError(error: unknown): error is ViemError {
  const viemErrorNames = [
    ContractFunctionExecutionError.prototype.constructor.name,
    ContractFunctionRevertedError.prototype.constructor.name,
  ];
  return viemErrorNames.includes(error?.constructor?.name || "");
}

export function isFeeReceiverSameAsSigner(chainId: number) {
  const feeReceiverAddress = getFeeReceiverAddress(chainId);
  const signerAddress = privateKeyToAccount(getSignerPrivateKey(chainId) as `0x${string}`).address;
  return feeReceiverAddress.toLowerCase() === signerAddress.toLowerCase();
}

export function isNative(asset: `0x${string}`) {
  return asset.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}
