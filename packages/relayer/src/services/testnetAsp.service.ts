import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon } from "maci-crypto/build/ts/hashing.js";
import { parseAbiItem } from "viem";
import { CONFIG } from "../config/index.js";
import { web3Provider } from "../providers/index.js";

const depositedEvent = parseAbiItem(
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _merkleRoot)",
);
const entrypointAbi = [{
  type: "function", name: "latestRoot", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }],
}, {
  type: "function", name: "updateRoot", stateMutability: "nonpayable", inputs: [
    { name: "_root", type: "uint256" }, { name: "_ipfsCID", type: "string" },
  ], outputs: [{ type: "uint256" }],
}] as const;

export type AspProof = { root: string; depth: number; proof: { index: number; siblings: string[]; root: string } };

/** Testnet-only ASP: mirrors every configured pool's deposit labels into Entrypoint. */
export class TestnetAspService {
  private readonly enabled = process.env.TESTNET_ASP_MODE === "true";
  private readonly trees = new Map<number, LeanIMT<bigint>>();
  private refreshing = new Map<number, Promise<void>>();

  isEnabled() { return this.enabled; }

  start() {
    if (!this.enabled) return;
    const interval = Number(process.env.TESTNET_ASP_POLL_MS ?? 10_000);
    for (const chain of CONFIG.chains) void this.refresh(chain.chain_id);
    setInterval(() => { for (const chain of CONFIG.chains) void this.refresh(chain.chain_id); }, interval);
  }

  async refresh(chainId: number): Promise<void> {
    if (!this.enabled) return;
    const existing = this.refreshing.get(chainId);
    if (existing) return existing;
    const work = this.refreshInternal(chainId).finally(() => this.refreshing.delete(chainId));
    this.refreshing.set(chainId, work);
    return work;
  }

  private async refreshInternal(chainId: number) {
    const chain = CONFIG.chains.find((item) => item.chain_id === chainId);
    if (!chain || chain.asp_pools.length === 0 || !chain.entrypoint_address) return;
    const logs = (await Promise.all(chain.asp_pools.map((pool) => web3Provider.client(chainId).getLogs({
      address: pool.pool_address,
      event: depositedEvent,
      fromBlock: pool.start_block,
      toBlock: "latest",
    })))).flat().sort((a, b) => Number(a.blockNumber - b.blockNumber) || Number((a.logIndex ?? 0) - (b.logIndex ?? 0)));
    const labels = logs.map((log) => log.args._label).filter((label): label is bigint => label !== undefined);
    if (labels.length === 0) return;
    const tree = new LeanIMT((left, right) => poseidon([left, right]));
    tree.insertMany(labels);
    this.trees.set(chainId, tree);
    const currentRoot = await web3Provider.client(chainId).readContract({ address: chain.entrypoint_address, abi: entrypointAbi, functionName: "latestRoot" });
    if (currentRoot === tree.root) return;
    const cid = process.env.TESTNET_ASP_IPFS_CID ?? "testnet-asp-root-all-labels-placeholder";
    const hash = await web3Provider.signer(chainId).writeContract({ chain: web3Provider.chains[chainId]!, account: web3Provider.signers[chainId]!.account!, address: chain.entrypoint_address, abi: entrypointAbi, functionName: "updateRoot", args: [tree.root, cid] });
    await web3Provider.client(chainId).waitForTransactionReceipt({ hash });
    console.log(`[testnet-asp] updated chain ${chainId} root to ${tree.root} (${labels.length} labels), tx ${hash}`);
  }

  async proof(chainId: number, label: bigint): Promise<AspProof> {
    await this.refresh(chainId);
    const tree = this.trees.get(chainId);
    if (!tree) throw new Error(`No ASP labels available for chain ${chainId}`);
    const index = tree.indexOf(label);
    if (index < 0) throw new Error("Label is not in the testnet ASP set");
    const proof = tree.generateProof(index);
    return { root: proof.root.toString(), depth: tree.depth, proof: { index: proof.index, siblings: proof.siblings.map(String), root: proof.root.toString() } };
  }
}

export const testnetAspService = new TestnetAspService();
