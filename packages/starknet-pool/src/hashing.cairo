use garaga::hashes::poseidon_bn254::poseidon_hash_2;

/// Left-fold of the circomlib-compatible 2-input BN254 Poseidon over a list of field elements.
///
/// The `withdrawL2` circuit treats `context` as opaque (it only pins it via `context*context`), so
/// the derivation is a pool<->SDK convention, not a circuit constraint. We define it as this fold of
/// `poseidon_hash_2` because Garaga exposes only the 2-input hash and the SDK can mirror the same fold
/// with maci/circomlib Poseidon. The output is natively a BN254 field element (no mod-p reduction).
///
/// Requires at least 2 inputs. Every input must be < the BN254 scalar field.
pub fn poseidon_fold(inputs: Span<u256>) -> u256 {
    assert(inputs.len() >= 2, 'poseidon_fold: need >= 2');
    let mut acc = poseidon_hash_2(*inputs.at(0), *inputs.at(1));
    let mut i: usize = 2;
    while i < inputs.len() {
        acc = poseidon_hash_2(acc, *inputs.at(i));
        i += 1;
    };
    acc
}
