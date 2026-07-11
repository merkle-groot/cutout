// Step 1: deposit an L1 note, then validate that off-chain Poseidon (maci-crypto)
// agrees with on-chain poseidon-solidity by comparing the pool root/commitment.
import { createWalletClient, createPublicClient, http, parseEther, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import fs from 'fs';
import { precommitment, commitmentHash, rand, LeanIMT, leanHash } from './lib.mjs';

const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const PK = '0xa444d7d9c4ccd73b150eb4f6e58545b11d071862a88535bfb07c4a42966bbf88';
const POOL = '0xd2709ad0e3d2af2ca9429a94232255fa6f54e473';

const abi = parseAbi([
  'function deposit(uint256 _precommitment) payable returns (uint256)',
  'function currentRoot() view returns (uint256)',
  'function currentTreeDepth() view returns (uint256)',
  'event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)',
]);

const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });

const nullifier = rand();
const secret = rand();
const precom = precommitment(nullifier, secret);
console.log('note nullifier:', nullifier.toString());
console.log('note secret:   ', secret.toString());
console.log('precommitment: ', precom.toString());

const DEPOSIT_WEI = parseEther('0.01');
console.log('\ndepositing', DEPOSIT_WEI.toString(), 'wei ...');
const hash = await wallet.writeContract({ address: POOL, abi, functionName: 'deposit', args: [precom], value: DEPOSIT_WEI });
console.log('deposit tx:', hash);
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log('status:', rcpt.status, 'block:', rcpt.blockNumber);

// parse Deposited event
const logs = await pub.getContractEvents({ address: POOL, abi, eventName: 'Deposited', fromBlock: rcpt.blockNumber, toBlock: rcpt.blockNumber });
const ev = logs[0].args;
const label = ev._label;
const valueAfterFee = ev._value;
const onchainCommitment = ev._commitment;
console.log('\n== Deposited event ==');
console.log('label:          ', label.toString());
console.log('value(afterFee):', valueAfterFee.toString());
console.log('commitment:     ', onchainCommitment.toString());

// off-chain recompute
const localCommitment = commitmentHash(valueAfterFee, label, precom);
console.log('\n== Poseidon parity check ==');
console.log('local commitment:', localCommitment.toString());
console.log('MATCH commitment:', localCommitment === onchainCommitment);

const onchainRoot = await pub.readContract({ address: POOL, abi, functionName: 'currentRoot' });
const onchainDepth = await pub.readContract({ address: POOL, abi, functionName: 'currentTreeDepth' });
// local single-leaf tree
const tree = new LeanIMT(leanHash);
tree.insert(onchainCommitment);
console.log('\n== root/tree check ==');
console.log('onchain root:', onchainRoot.toString(), 'depth:', onchainDepth.toString());
console.log('local  root:', tree.root.toString(), 'depth:', tree.depth);
console.log('MATCH root:', tree.root === onchainRoot);

// persist for the prove/relay step
fs.writeFileSync('/tmp/e2e_deposit.json', JSON.stringify({
  nullifier: nullifier.toString(), secret: secret.toString(), precom: precom.toString(),
  label: label.toString(), valueAfterFee: valueAfterFee.toString(),
  commitment: onchainCommitment.toString(), depositTx: hash,
  onchainRoot: onchainRoot.toString(), onchainDepth: onchainDepth.toString(),
}, null, 2));
console.log('\nsaved /tmp/e2e_deposit.json');
