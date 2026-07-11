pragma circom 2.2.0;

include "../../../node_modules/circomlib/circuits/poseidon.circom";
include "../../../node_modules/circomlib/circuits/babyjub.circom";
include "../../../node_modules/circomlib/circuits/bitify.circom";
/**
 * @title CommitmentHasherL2Sender template
 * @dev Builds a stealth destination note (C_dest) for a recipient: derives the
 *      one-time owner key P = B + Poseidon(ss)·G and hashes the commitment.
 *      The scanning view tag is NOT computed here: it is a soundness-irrelevant
 *      off-chain hint derived from the same shared secret, carried alongside E
 *      in the note transport rather than constrained in-circuit.
 */
template CommitmentHasherL2Sender() {

  //////////////////////// SIGNALS ////////////////////////
  signal input spendingPublicKey[2];   // Recipient spend pubkey B = b·G
  signal input sharedSecretX;           // ECDH shared secret ss = e·V = v·E
  signal input value;              // Value of commitment

  signal output commitment;        // Commitment hash
  ///////////////////// END OF SIGNALS /////////////////////

  // 0. Derive one-time owner key P = B + Poseidon(ss)·G
  //    Poseidon(ss) is the stealth tweak; BabyPbk multiplies it by the
  //    BabyJubjub base point (BASE8, the subgroup generator).
  component ssHasher = Poseidon(1);
  ssHasher.inputs[0] <== sharedSecretX;

  // tweak = Poseidon(ss)·G. Poseidon(ss) is a full field element (up to ~254
  // bits), so we cannot use BabyPbk (Num2Bits(253) — would assert for ~44% of
  // shared secrets). Decompose to 254 bits and use a fixed-base mult on BASE8.
  var BASE8[2] = [
    5299619240641551281634865583518297030282874472190772894086521144482721001553,
    16950150798460657717958625567821834550301663161624707787222815936182638968203
  ];
  component tweakBits = Num2Bits(254);
  tweakBits.in <== ssHasher.out;
  component tweakMul = EscalarMulFix(254, BASE8);
  for (var i = 0; i < 254; i++) {
    tweakMul.e[i] <== tweakBits.out[i];
  }

  component ownerKey = BabyAdd();        // P = B + Poseidon(ss)·G
  ownerKey.x1 <== spendingPublicKey[0];
  ownerKey.y1 <== spendingPublicKey[1];
  ownerKey.x2 <== tweakMul.out[0];
  ownerKey.y2 <== tweakMul.out[1];

  signal stealthPublicKey[2];
  stealthPublicKey[0] <== ownerKey.xout;
  stealthPublicKey[1] <== ownerKey.yout;

  component blindingValue = Poseidon(2);
  blindingValue.inputs[0] <== sharedSecretX;
  blindingValue.inputs[1] <== 1;

  component commitmentHasher = Poseidon(4);
  commitmentHasher.inputs[0] <== stealthPublicKey[0];
  commitmentHasher.inputs[1] <== stealthPublicKey[1];
  commitmentHasher.inputs[2] <== value;
  commitmentHasher.inputs[3] <== blindingValue.out;

  commitment <== commitmentHasher.out;
}
