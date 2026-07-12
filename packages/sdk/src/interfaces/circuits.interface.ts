/**
 * Available circuit types in the system.
 */
export enum CircuitName {
  Commitment = "commitment",
  /** Mode-3 L1 spend: burns the L1 note, emits the bridged C_dest note. */
  WithdrawL1 = "withdrawL1",
  /** Mode-3 L2 spend: opens a stealth note in the destination shielded pool. */
  WithdrawL2 = "withdrawL2",
}

/**
 * Type for circuit input signals.
 */
export type CircuitSignals = {
  [key: string]: bigint | bigint[] | string;
};

/**
 * Interface for accessing circuit-related resources.
 */
export interface CircuitsInterface {
  /**
   * Gets the WASM binary for a circuit.
   */
  getWasm(name: CircuitName): Promise<Uint8Array>;

  /**
   * Gets the proving key for a circuit.
   */
  getProvingKey(name: CircuitName): Promise<Uint8Array>;

  /**
   * Gets the verification key for a circuit.
   */
  getVerificationKey(name: CircuitName): Promise<Uint8Array>;
}
