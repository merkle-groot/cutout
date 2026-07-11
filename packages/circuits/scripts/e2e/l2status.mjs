// Poll the L2 pool for the bridged note + tokens (OP canonical relay is async).
import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { optimismSepolia } from 'viem/chains';
import fs from 'fs';

const L2_RPC = 'https://optimism-sepolia.drpc.org';
const L2POOL = '0x643aa915d2416118905618f109f6b639c904710a';
const r = JSON.parse(fs.readFileSync('/tmp/e2e_relay.json'));
const cDest = BigInt(r.cDest);

const abi = parseAbi([
  'function receivedCommitments(uint256) view returns (bool)',
  'function pendingValue(uint256) view returns (uint256)',
  'function activatedSupply() view returns (uint256)',
  'function tokensReceivedFromBridge() view returns (uint256)',
  'function currentRoot() view returns (uint256)',
  'function nullifierHashes(uint256) view returns (bool)',
]);
const pub = createPublicClient({ chain: optimismSepolia, transport: http(L2_RPC) });

const received = await pub.readContract({ address: L2POOL, abi, functionName: 'receivedCommitments', args: [cDest] });
const pending = await pub.readContract({ address: L2POOL, abi, functionName: 'pendingValue', args: [cDest] });
const activated = await pub.readContract({ address: L2POOL, abi, functionName: 'activatedSupply' });
const received$ = await pub.readContract({ address: L2POOL, abi, functionName: 'tokensReceivedFromBridge' });
const root = await pub.readContract({ address: L2POOL, abi, functionName: 'currentRoot' });
const bal = await pub.getBalance({ address: L2POOL });

console.log('C_dest:', cDest.toString());
console.log('note received (message landed):', received);
console.log('note pendingValue:', formatEther(pending), 'ETH');
console.log('activatedSupply:', formatEther(activated), 'ETH');
console.log('tokensReceivedFromBridge:', formatEther(received$), 'ETH');
console.log('pool ETH balance:', formatEther(bal), 'ETH');
console.log('currentRoot:', root.toString());
console.log('note in tree (root != 0):', root !== 0n);
