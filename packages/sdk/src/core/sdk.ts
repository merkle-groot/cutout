import { CommitmentService } from "./commitment.service.js";
import { WithdrawalService } from "./withdrawal.service.js";
import { CircuitsInterface } from "../interfaces/circuits.interface.js";
import { Commitment, CommitmentProof } from "../types/commitment.js";
import {
  WithdrawalProof,
  WithdrawalProofInput,
  WithdrawL1ProofInput,
  WithdrawL2ProofInput,
} from "../types/withdrawal.js";
import { ContractInteractionsService } from "./contracts.service.js";
import { Hex, Address, Chain } from "viem";
import { AccountCommitment } from "../types/account.js";

/**
 * Main SDK class providing access to all privacy pool functionality.
 * Uses Poseidon hash for all commitment operations.
 */
export class PrivacyPoolSDK {
  private readonly commitmentService: CommitmentService;
  private readonly withdrawalService: WithdrawalService;

  constructor(circuits: CircuitsInterface) {
    this.commitmentService = new CommitmentService(circuits);
    this.withdrawalService = new WithdrawalService(circuits);
  }

  public createContractInstance(
    rpcUrl: string,
    chain: Chain,
    entrypointAddress: Address,
    privateKey: Hex,
  ): ContractInteractionsService {
    return new ContractInteractionsService(
      rpcUrl,
      chain,
      entrypointAddress,
      privateKey,
    );
  }

  /**
   * Generates a commitment proof.
   *
   * @param value - Value to commit
   * @param label - Label for the commitment
   * @param nullifier - Nullifier for the commitment
   * @param secret - Secret for the commitment
   */
  public async proveCommitment(
    value: bigint,
    label: bigint,
    nullifier: bigint,
    secret: bigint,
  ): Promise<CommitmentProof> {
    return this.commitmentService.proveCommitment(
      value,
      label,
      nullifier,
      secret,
    );
  }

  /**
   * Verifies a commitment proof.
   *
   * @param proof - The proof to verify
   */
  public async verifyCommitment(proof: CommitmentProof): Promise<boolean> {
    return this.commitmentService.verifyCommitment(proof);
  }

  /**
   * Generates a Mode-3 `withdrawL1` (relay) proof: burns the spent L1 note and
   * emits the bridged destination commitment `C_dest`.
   *
   * @param commitment - The L1 note being spent.
   * @param input - `withdrawL1` proof inputs.
   */
  public async proveWithdrawalL1(
    commitment: Commitment | AccountCommitment,
    input: WithdrawL1ProofInput,
  ): Promise<WithdrawalProof> {
    return await this.withdrawalService.proveWithdrawalL1(commitment, input);
  }

  /**
   * Generates a Mode-3 `withdrawL2` (spend) proof: spends the delivered stealth
   * note in the destination shielded pool.
   *
   * @param input - `withdrawL2` proof inputs.
   */
  public async proveWithdrawalL2(
    input: WithdrawL2ProofInput,
  ): Promise<WithdrawalProof> {
    return await this.withdrawalService.proveWithdrawalL2(input);
  }

  /** Verifies a `withdrawL1` proof. */
  public async verifyWithdrawalL1(
    withdrawalProof: WithdrawalProof,
  ): Promise<boolean> {
    return this.withdrawalService.verifyWithdrawalL1(withdrawalProof);
  }

  /** Verifies a `withdrawL2` proof. */
  public async verifyWithdrawalL2(
    withdrawalProof: WithdrawalProof,
  ): Promise<boolean> {
    return this.withdrawalService.verifyWithdrawalL2(withdrawalProof);
  }

  /**
   * @deprecated Use {@link proveWithdrawalL1}. Retained until consumers migrate.
   */
  public async proveWithdrawal(
    commitment: Commitment | AccountCommitment,
    input: WithdrawalProofInput,
  ): Promise<WithdrawalProof> {
    return await this.withdrawalService.proveWithdrawal(commitment, input);
  }

  /**
   * @deprecated Use {@link verifyWithdrawalL1} / {@link verifyWithdrawalL2}.
   */
  public async verifyWithdrawal(
    withdrawalProof: WithdrawalProof,
  ): Promise<boolean> {
    return this.withdrawalService.verifyWithdrawal(withdrawalProof);
  }
}
