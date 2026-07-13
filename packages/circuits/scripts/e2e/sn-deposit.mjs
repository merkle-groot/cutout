// Stage 3a: deposit an L1 note into the Starknet-fixed pool.
import { createWalletClient, createPublicClient, http, parseEther, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import fs from 'fs';
import { precommitment, commitmentHash, rand, LeanIMT, leanHash } from './lib.mjs';

const RPC = 'https://sepolia.drpc.org';
const PK = '0xa444d7d9c4ccd73b150eb4f6e58545b11d071862a88535bfb07c4a42966bbf88';
const POOL = '0x2e302A22FC09516e64fC44ADb2f527939c5fBB6D'; // starknet-fixed L1 pool

const abi = parseAbi([
  'function deposit(uint256 _precommitment) payable returns (uint256)',
  'function currentRoot() view returns (uint256)',
  'event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)',
]);

const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });

const nullifier = rand(), secret = rand();
const precom = precommitment(nullifier, secret);
const DEPOSIT_WEI = parseEther('0.01');
console.log('depositing 0.01 ETH, precommitment', precom.toString());
const hash = await wallet.writeContract({ address: POOL, abi, functionName: 'deposit', args: [precom], value: DEPOSIT_WEI });
const rcpt = await pub.waitForTransactionReceipt({ hash });
console.log('deposit tx:', hash, 'status:', rcpt.status);

const logs = await pub.getContractEvents({ address: POOL, abi, eventName: 'Deposited', fromBlock: rcpt.blockNumber, toBlock: rcpt.blockNumber });
const ev = logs[0].args;
const localCommitment = commitmentHash(ev._value, ev._label, precom);
console.log('commitment:', ev._commitment.toString(), 'poseidon parity:', localCommitment === ev._commitment);

fs.writeFileSync('/tmp/sn_deposit.json', JSON.stringify({
  nullifier: nullifier.toString(), secret: secret.toString(), precom: precom.toString(),
  label: ev._label.toString(), valueAfterFee: ev._value.toString(),
  commitment: ev._commitment.toString(), depositTx: hash, depositBlock: rcpt.blockNumber.toString(),
}, null, 2));
console.log('saved /tmp/sn_deposit.json');
