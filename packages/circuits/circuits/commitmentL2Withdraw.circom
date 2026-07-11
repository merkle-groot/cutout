pragma circom 2.2.0;

include "../../../node_modules/circomlib/circuits/poseidon.circom";
include "../../../node_modules/circomlib/circuits/babyjub.circom";

/**
 * @title CommitmentHasherL2Withdraw template
 * @dev Recomputes an L2 stealth note commitment from its owner key and derives
 *      the note's nullifier hash for spending.
 */
template CommitmentHasherL2Withdraw() {

  //////////////////////// SIGNALS ////////////////////////
  signal input stealthPrivateKey;  // p = (b + Poseidon(ss)) mod L
  signal input sharedSecretX;
  signal input value;              // Value of commitment

  signal output commitment;        // Commitment hash
  signal output nullifierHash;
  ///////////////////// END OF SIGNALS /////////////////////

  component pkComponent = BabyPbk();          // P = stealthPrivateKey·G
  pkComponent.in <== stealthPrivateKey;

  component blindingValue = Poseidon(2);
  blindingValue.inputs[0] <== sharedSecretX;
  blindingValue.inputs[1] <== 1;

  component commitmentHasher = Poseidon(4);
  commitmentHasher.inputs[0] <== pkComponent.Ax;
  commitmentHasher.inputs[1] <== pkComponent.Ay;
  commitmentHasher.inputs[2] <== value;
  commitmentHasher.inputs[3] <== blindingValue.out;

  commitment <== commitmentHasher.out;

  // Nullifier = Poseidon(p, commitment): owner-only (needs p), unlinkable to the
  // public leaf, and STABLE — the commitment is position-independent, unlike the
  // LeanIMT path index which changes as the tree grows (binding that would let
  // the same note produce two different valid nullifiers → double-spend).
  component nullifierHasher = Poseidon(2);
  nullifierHasher.inputs[0] <== stealthPrivateKey;
  nullifierHasher.inputs[1] <== commitmentHasher.out;

  nullifierHash <== nullifierHasher.out;
}
