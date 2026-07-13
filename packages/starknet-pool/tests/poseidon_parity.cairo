//! Poseidon parity: Garaga's `poseidon_hash_2` must equal circomlib/maci Poseidon, or the on-chain
//! LeanIMT root will never match the root the withdrawL2 circuit proves inclusion against.
//!
//! The spike fixture (`spike/fixtures/`) is a balanced 4-leaf LeanIMT built with maci Poseidon:
//!   leaves = [111111111111, 222222222222, 333333333333, noteLeaf], depth 2
//!   root   = P( P(l0,l1), P(l2,l3) )
//! We recompute that root here with Garaga's Poseidon and assert it equals the fixture's root.

use garaga::hashes::poseidon_bn254::poseidon_hash_2;

const L0: u256 = 111111111111;
const L1: u256 = 222222222222;
const L2: u256 = 333333333333;
const NOTE_LEAF: u256 = 7228244561325902880604135653349124518835432164549933617976242877070456665295;
const EXPECTED_ROOT: u256 =
    4746141274384843003516246808026191475835596923338180113295675049873177044782;

#[test]
fn garaga_poseidon_matches_circomlib_leanimt_root() {
    let left = poseidon_hash_2(L0, L1);
    let right = poseidon_hash_2(L2, NOTE_LEAF);
    let root = poseidon_hash_2(left, right);
    assert(root == EXPECTED_ROOT, 'poseidon parity mismatch');
}
