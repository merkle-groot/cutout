import * as snarkjs from "snarkjs";
import { ProofError } from "../errors/base.error.js";
import {
  CircuitName,
  CircuitsInterface,
} from "../interfaces/circuits.interface.js";
import {
  WithdrawalProof,
  WithdrawL1ProofInput,
  WithdrawL2ProofInput,
  WithdrawalProofInput,
} from "../types/withdrawal.js";
import { AccountCommitment, Commitment } from "../index.js";

/**
 * Service responsible for handling Mode-3 withdrawal proof generation.
 *
 * A Cutout withdrawal has two proven legs (CLAUDE.md §5–6):
 *  - `withdrawL1` — burns the spent L1 note and emits the bridged destination
 *    commitment `C_dest` (9 public signals).
 *  - `withdrawL2` — spends the delivered stealth note in the destination
 *    shielded pool (5 public signals).
 */
export class WithdrawalService {
  constructor(private readonly circuits: CircuitsInterface) {}

  /**
   * Generates a Mode-3 `withdrawL1` (relay) proof. Input signals mirror
   * `packages/circuits/scripts/e2e/relay.mjs`; the circuit outputs the L1 change
   * note and `C_dest` (see `WITHDRAW_L1_SIGNALS`).
   *
   * @param commitment - The L1 note being spent.
   * @param input - `withdrawL1` proof inputs.
   * @throws {ProofError} If proof generation fails.
   */
  public async proveWithdrawalL1(
    commitment: Commitment | AccountCommitment,
    input: WithdrawL1ProofInput,
  ): Promise<WithdrawalProof> {
    try {
      const inputSignals = this.prepareL1InputSignals(commitment, input);
      const wasm = await this.circuits.getWasm(CircuitName.WithdrawL1);
      const zkey = await this.circuits.getProvingKey(CircuitName.WithdrawL1);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputSignals,
        wasm,
        zkey,
      );

      return { proof, publicSignals };
    } catch (error) {
      throw ProofError.generationFailed({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Generates a Mode-3 `withdrawL2` (spend) proof. Input signals mirror
   * `packages/circuits/scripts/e2e/l2withdraw.mjs`. Public-signal order MUST be
   * `[0]=nullifier, [1]=noteValue` to match `L2ProofLib.sol` (see
   * `WITHDRAW_L2_SIGNALS`).
   *
   * @param input - `withdrawL2` proof inputs.
   * @throws {ProofError} If proof generation fails.
   */
  public async proveWithdrawalL2(
    input: WithdrawL2ProofInput,
  ): Promise<WithdrawalProof> {
    try {
      const inputSignals = this.prepareL2InputSignals(input);
      const wasm = await this.circuits.getWasm(CircuitName.WithdrawL2);
      const zkey = await this.circuits.getProvingKey(CircuitName.WithdrawL2);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputSignals,
        wasm,
        zkey,
      );

      return { proof, publicSignals };
    } catch (error) {
      throw ProofError.generationFailed({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Verifies a `withdrawL1` proof against the L1 verification key.
   * @throws {ProofError} If verification fails.
   */
  public async verifyWithdrawalL1(
    withdrawalPayload: WithdrawalProof,
  ): Promise<boolean> {
    return this.verifyWith(CircuitName.WithdrawL1, withdrawalPayload);
  }

  /**
   * Verifies a `withdrawL2` proof against the L2 verification key.
   * @throws {ProofError} If verification fails.
   */
  public async verifyWithdrawalL2(
    withdrawalPayload: WithdrawalProof,
  ): Promise<boolean> {
    return this.verifyWith(CircuitName.WithdrawL2, withdrawalPayload);
  }

  private async verifyWith(
    circuit: CircuitName.WithdrawL1 | CircuitName.WithdrawL2,
    withdrawalPayload: WithdrawalProof,
  ): Promise<boolean> {
    try {
      const vkeyBin = await this.circuits.getVerificationKey(circuit);
      const vkey = JSON.parse(new TextDecoder("utf-8").decode(vkeyBin));
      return await snarkjs.groth16.verify(
        vkey,
        withdrawalPayload.publicSignals,
        withdrawalPayload.proof,
      );
    } catch (error) {
      throw ProofError.verificationFailed({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * @deprecated Use {@link proveWithdrawalL1}. Thin shim retained until
   * consumers migrate to the split API (Phase 6). Maps the legacy
   * `withdrawalAmount` field to `withdrawnValue` and forwards.
   */
  public async proveWithdrawal(
    _commitment: Commitment | AccountCommitment,
    _input: WithdrawalProofInput,
  ): Promise<WithdrawalProof> {
    throw ProofError.generationFailed({
      error:
        "proveWithdrawal is removed in Mode-3; use proveWithdrawalL1 with a " +
        "WithdrawL1ProofInput (adds spendingPublicKey + sharedSecretX).",
    });
  }

  /**
   * @deprecated Use {@link verifyWithdrawalL1} / {@link verifyWithdrawalL2}.
   */
  public async verifyWithdrawal(
    withdrawalPayload: WithdrawalProof,
  ): Promise<boolean> {
    // Legacy callers verified the (single) withdrawal proof; route to L1.
    return this.verifyWithdrawalL1(withdrawalPayload);
  }

  /**
   * Prepares input signals for the `withdrawL1` circuit.
   */
  private prepareL1InputSignals(
    commitment: Commitment | AccountCommitment,
    input: WithdrawL1ProofInput,
  ): Record<string, bigint | bigint[] | string> {
    let existingValue: bigint;
    let existingNullifier: bigint;
    let existingSecret: bigint;
    let label: bigint;
    if ("preimage" in commitment) {
      existingValue = commitment.preimage.value;
      existingNullifier = commitment.preimage.precommitment.nullifier;
      existingSecret = commitment.preimage.precommitment.secret;
      label = commitment.preimage.label;
    } else {
      existingValue = commitment.value;
      existingNullifier = commitment.nullifier;
      existingSecret = commitment.secret;
      label = commitment.label;
    }

    return {
      // Public signals
      withdrawnValue: input.withdrawnValue,
      bridgedValue: input.bridgedValue ?? input.withdrawnValue,
      stateRoot: input.stateRoot,
      stateTreeDepth: input.stateTreeDepth,
      ASPRoot: input.aspRoot,
      ASPTreeDepth: input.aspTreeDepth,
      context: input.context,

      // Private signals — spent note preimage
      label,
      existingValue,
      existingNullifier,
      existingSecret,

      // Stealth binding (folded into C_dest via P)
      spendingPublicKey: [
        input.spendingPublicKey[0],
        input.spendingPublicKey[1],
      ],
      sharedSecretX: input.sharedSecretX,

      // L1 change note
      newNullifier: input.newNullifier,
      newSecret: input.newSecret,

      // Merkle proofs
      stateSiblings: input.stateMerkleProof.siblings,
      stateIndex: BigInt(input.stateMerkleProof.index),
      ASPSiblings: input.aspMerkleProof.siblings,
      ASPIndex: BigInt(input.aspMerkleProof.index),
    };
  }

  /**
   * Prepares input signals for the `withdrawL2` circuit.
   */
  private prepareL2InputSignals(
    input: WithdrawL2ProofInput,
  ): Record<string, bigint | bigint[] | string> {
    return {
      // Public signals
      noteValue: input.noteValue,
      stateRoot: input.stateRoot,
      stateTreeDepth: input.stateTreeDepth,
      context: input.context,

      // Spend authorization (opens the Poseidon ownership constraint)
      stealthPrivateKey: input.stealthPrivateKey,
      sharedSecretX: input.sharedSecretX,

      // Merkle proof
      stateSiblings: input.stateMerkleProof.siblings,
      stateIndex: BigInt(input.stateMerkleProof.index),
    };
  }
}
