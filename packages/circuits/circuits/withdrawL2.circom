pragma circom 2.2.0;

include "./commitmentL2Withdraw.circom";
include "./merkleTree.circom";
include "../../../node_modules/circomlib/circuits/bitify.circom";

/**
 * @title WithdrawL2 template
 * @dev Spends a stealth note on the destination L2: proves ownership of the
 *      note, verifies its inclusion in the L2 state tree, and exposes the
 *      note's nullifier hash so the pool can mark it spent.
 * @param maxTreeDepth The maximum depth of the Merkle trees
 */
template WithdrawL2(maxTreeDepth) {
  //////////////////////// PUBLIC SIGNALS ////////////////////////

  // Signals to compute commitments
  signal input noteValue;                        // Value being withdrawn

  // Signals for merkle tree inclusion proofs
  signal input stateRoot;                        // A known state root
  signal input stateTreeDepth;                   // Current state tree depth
  signal input context;                          // keccak256(IPrivacyPool.Withdrawal, scope) % SNARK_SCALAR_FIELD
  //////////////////// END OF PUBLIC SIGNALS ////////////////////


  /////////////////////// PRIVATE SIGNALS ///////////////////////

  // Signals to compute commitments
  signal input stealthPrivateKey;
  signal input sharedSecretX;

  // Signals for merkle tree inclusion proofs
  signal input stateSiblings[maxTreeDepth];      // Siblings of the state tree
  signal input stateIndex;      


  /////////////////// END OF PRIVATE SIGNALS ///////////////////


  /////////////////////// OUTPUT SIGNALS ///////////////////////

  signal output existingNullifierHash;           // Hash of the existing commitment nullifier

  /////////////////// END OF OUTPUT SIGNALS ///////////////////

  // 1. Compute existing commitment
  component existingCommitmentHasher = CommitmentHasherL2Withdraw();
  existingCommitmentHasher.stealthPrivateKey <== stealthPrivateKey;
  existingCommitmentHasher.sharedSecretX <== sharedSecretX;
  existingCommitmentHasher.value <== noteValue;
  signal existingCommitment <== existingCommitmentHasher.commitment;

  // 2. Output existing nullifier hash
  existingNullifierHash <== existingCommitmentHasher.nullifierHash;

  // 3. Verify existing commitment is in state tree
  component stateRootChecker = LeanIMTInclusionProof(maxTreeDepth);
  stateRootChecker.leaf <== existingCommitment;
  stateRootChecker.leafIndex <== stateIndex;
  stateRootChecker.siblings <== stateSiblings;
  stateRootChecker.actualDepth <== stateTreeDepth;

  stateRoot === stateRootChecker.out;

  component withdrawnValueRangeCheck = Num2Bits(128);
  withdrawnValueRangeCheck.in <== noteValue;
  _ <== withdrawnValueRangeCheck.out;

  // 9. Square context for integrity
  signal contextSquared <== context * context;
}
