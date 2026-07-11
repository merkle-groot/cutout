import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { optimismSepolia } from 'viem/chains';
import fs from 'fs';
const L2POOL='0x643aa915d2416118905618f109f6b639c904710a';
const cDest=BigInt(JSON.parse(fs.readFileSync('/tmp/e2e_relay.json')).cDest);
const abi=parseAbi(['function receivedCommitments(uint256) view returns (bool)','function tokensReceivedFromBridge() view returns (uint256)','function pendingValue(uint256) view returns (uint256)','function activatedSupply() view returns (uint256)']);
const pub=createPublicClient({chain:optimismSepolia,transport:http('https://optimism-sepolia.drpc.org')});
const rec=await pub.readContract({address:L2POOL,abi,functionName:'receivedCommitments',args:[cDest]});
const tok=await pub.readContract({address:L2POOL,abi,functionName:'tokensReceivedFromBridge'});
const pend=await pub.readContract({address:L2POOL,abi,functionName:'pendingValue',args:[cDest]});
const act=await pub.readContract({address:L2POOL,abi,functionName:'activatedSupply'});
process.stderr.write(`msg=${rec} tokens=${formatEther(tok)} pending=${formatEther(pend)} activated=${formatEther(act)}\n`);
// ready when the note message landed AND enough tokens to back it
process.exit(rec && tok>0n ? 0 : 1);
