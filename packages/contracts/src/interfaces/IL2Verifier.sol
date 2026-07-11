// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/**
 * @title IL2Verifier
 * @notice Interface of the Groth16 verifier for L2 shielded-pool withdrawals.
 * @dev The L2 withdrawal circuit is leaner than the L1 one: there is no ASP association check and no
 *      change note, so it exposes five public signals (see `L2ProofLib.WithdrawProof`).
 */
interface IL2Verifier {
  /**
   * @notice Verifies an L2 withdrawal proof
   * @param _pA First elliptic curve point (π_A) of the Groth16 proof, encoded as two field elements
   * @param _pB Second elliptic curve point (π_B) of the Groth16 proof, encoded as 2x2 field elements
   * @param _pC Third elliptic curve point (π_C) of the Groth16 proof, encoded as two field elements
   * @param _pubSignals The proof public signals
   * @return _valid Whether the proof is valid
   */
  function verifyProof(
    uint256[2] memory _pA,
    uint256[2][2] memory _pB,
    uint256[2] memory _pC,
    uint256[5] memory _pubSignals
  ) external returns (bool _valid);
}
