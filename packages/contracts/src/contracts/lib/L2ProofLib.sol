// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/**
 * @title L2ProofLib
 * @notice Accessors for the public signals of an L2 withdrawal Groth16 proof.
 * @dev The L2 spend proves ownership of a bridged destination note (`C_dest`) inside the L2 tree and
 *      authorizes exiting its full value to a clear recipient. There is no ASP association check and
 *      no change note, so the signal set is smaller than the L1 `ProofLib.WithdrawProof`.
 */
library L2ProofLib {
  /**
   * @notice Groth16 proof elements and public signals for an L2 withdrawal
   * @param pA First elliptic curve point (π_A), encoded as two field elements
   * @param pB Second elliptic curve point (π_B), encoded as a 2x2 matrix of field elements
   * @param pC Third elliptic curve point (π_C), encoded as two field elements
   * @param pubSignals Public inputs/outputs, in circom order (circuit output first, then public inputs
   *        in `component main` order — `[existingNullifierHash, noteValue, stateRoot, stateTreeDepth, context]`):
   *        - [0] nullifierHash: nullifier of the note being spent (circuit output)
   *        - [1] withdrawnValue: full value of the note being spent (`noteValue`)
   *        - [2] stateRoot: L2 state root the inclusion proof was built against
   *        - [3] stateTreeDepth: depth of the L2 state tree at proof time
   *        - [4] context: binds the proof to the withdrawal request (relayer, recipient, fee)
   */
  struct WithdrawProof {
    uint256[2] pA;
    uint256[2][2] pB;
    uint256[2] pC;
    uint256[5] pubSignals;
  }

  /**
   * @notice The full value of the note being spent
   * @param _p The proof containing the public signals
   * @return The withdrawn value
   */
  function withdrawnValue(WithdrawProof memory _p) internal pure returns (uint256) {
    return _p.pubSignals[1];
  }

  /**
   * @notice The nullifier of the note being spent
   * @param _p The proof containing the public signals
   * @return The nullifier hash
   */
  function nullifierHash(WithdrawProof memory _p) internal pure returns (uint256) {
    return _p.pubSignals[0];
  }

  /**
   * @notice The L2 state root the inclusion proof was built against
   * @param _p The proof containing the public signals
   * @return The state root
   */
  function stateRoot(WithdrawProof memory _p) internal pure returns (uint256) {
    return _p.pubSignals[2];
  }

  /**
   * @notice The depth of the L2 state tree at proof time
   * @param _p The proof containing the public signals
   * @return The state tree depth
   */
  function stateTreeDepth(WithdrawProof memory _p) internal pure returns (uint256) {
    return _p.pubSignals[3];
  }

  /**
   * @notice The context binding the proof to the withdrawal request
   * @param _p The proof containing the public signals
   * @return The context value
   */
  function context(WithdrawProof memory _p) internal pure returns (uint256) {
    return _p.pubSignals[4];
  }
}
