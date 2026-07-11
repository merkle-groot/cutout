pragma circom 2.2.0;

include "./commitmentL1.circom";
include "./commitmentL2Sender.circom";
include "./merkleTree.circom";
include "../../../node_modules/circomlib/circuits/comparators.circom";

/**
 * @title WithdrawL1 template
 * @dev Spends an L1 note to bridge value to L2: proves note ownership and ASP
 *      association, splits the value into an L1 change note and a bridged L2
 *      destination note (C_dest), and exposes the spent note's nullifier hash.
 * @param maxTreeDepth The maximum depth of the Merkle trees
 */
template WithdrawL1(maxTreeDepth) {
  //////////////////////// PUBLIC SIGNALS ////////////////////////

  // Signals to compute commitments
  signal input withdrawnValue;                   // Value being withdrawn

  // Signals for merkle tree inclusion proofs
  signal input stateRoot;                        // A known state root
  signal input stateTreeDepth;                   // Current state tree depth
  signal input ASPRoot;                          // Latest ASP root
  signal input ASPTreeDepth;                     // Current ASP tree depth
  signal input context;                          // keccak256(IPrivacyPool.Withdrawal, scope) % SNARK_SCALAR_FIELD

  //////////////////// END OF PUBLIC SIGNALS ////////////////////


  /////////////////////// PRIVATE SIGNALS ///////////////////////

  // Signals to compute commitments
  signal input label;                            // keccak256(scope, nonce) % SNARK_SCALAR_FIELD
  signal input existingValue;                    // Value of the existing commitment
  signal input existingNullifier;                // Nullifier of the existing commitment
  signal input existingSecret;                   // Secret of the existing commitment
  signal input spendingPublicKey[2];             // Spending public key of the receiver
  signal input sharedSecretX;                    // The shared secret computed between sender and receiver
  signal input newNullifier;                     // Nullifier for the new L1 change note
  signal input newSecret;                        // Secret for the new L1 change note

  // Signals for merkle tree inclusion proofs
  signal input stateSiblings[maxTreeDepth];      // Siblings of the state tree
  signal input stateIndex;                       // Indices for the state tree
  signal input ASPSiblings[maxTreeDepth];        // Siblings of the ASP tree
  signal input ASPIndex;                         // Indices for the ASP tree

  /////////////////// END OF PRIVATE SIGNALS ///////////////////


  /////////////////////// OUTPUT SIGNALS ///////////////////////
  signal output newCommitmentHashL1;             // Hash of the L1 change note (remaining value)
  signal output newCommitmentHashL2;             // Hash of the bridged L2 destination note (C_dest)
  signal output existingNullifierHash;           // Hash of the existing commitment nullifier

  /////////////////// END OF OUTPUT SIGNALS ///////////////////

  // 1. Compute existing commitment
  component existingCommitmentHasher = CommitmentHasherL1();
  existingCommitmentHasher.value <== existingValue;
  existingCommitmentHasher.label <== label;
  existingCommitmentHasher.nullifier <== existingNullifier;
  existingCommitmentHasher.secret <== existingSecret;
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

  // 4. Verify label is in ASP tree
  component ASPRootChecker = LeanIMTInclusionProof(maxTreeDepth);
  ASPRootChecker.leaf <== label;
  ASPRootChecker.leafIndex <== ASPIndex;
  ASPRootChecker.siblings <== ASPSiblings;
  ASPRootChecker.actualDepth <== ASPTreeDepth;

  ASPRoot === ASPRootChecker.out;

  // 5. Check the withdrawn amount is valid
  signal remainingValue <== existingValue - withdrawnValue;
  component remainingValueRangeCheck = Num2Bits(128);
  remainingValueRangeCheck.in <== remainingValue;
  _ <== remainingValueRangeCheck.out;
  component withdrawnValueRangeCheck = Num2Bits(128);
  withdrawnValueRangeCheck.in <== withdrawnValue;
  _ <== withdrawnValueRangeCheck.out;

  // 6. Ensure the change note uses a fresh nullifier (not the spent one)
  component nullifierEqualityCheck = IsEqual();
  nullifierEqualityCheck.in[0] <== existingNullifier;
  nullifierEqualityCheck.in[1] <== newNullifier;
  nullifierEqualityCheck.out === 0;

  // 7a. Compute the L1 change note holding the remaining value
  component changeCommitmentHasher = CommitmentHasherL1();
  changeCommitmentHasher.value <== remainingValue;
  changeCommitmentHasher.label <== label;
  changeCommitmentHasher.nullifier <== newNullifier;
  changeCommitmentHasher.secret <== newSecret;
  newCommitmentHashL1 <== changeCommitmentHasher.commitment;
  _ <== changeCommitmentHasher.nullifierHash;

  // 7b. Compute the bridged L2 destination note (C_dest)
  component destCommitmentHasher = CommitmentHasherL2Sender();
  destCommitmentHasher.spendingPublicKey[0] <== spendingPublicKey[0];
  destCommitmentHasher.spendingPublicKey[1] <== spendingPublicKey[1];
  destCommitmentHasher.sharedSecretX <== sharedSecretX;
  destCommitmentHasher.value <== withdrawnValue;

  // 8. Output new commitment hashes
  newCommitmentHashL2 <== destCommitmentHasher.commitment;

  // 9. Square context for integrity
  signal contextSquared <== context * context;
}
