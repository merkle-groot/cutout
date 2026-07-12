import "dotenv/config";
import cors from "cors";
import express from "express";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon } from "maci-crypto/build/ts/hashing.js";
import { Circuits, DataService, PrivacyPoolSDK } from "@0xbow/privacy-pools-core-sdk";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api/circuits/artifacts", express.static(fileURLToPath(new URL("../../node_modules/@0xbow/privacy-pools-core-sdk/dist/node/artifacts/", import.meta.url))));

let sdk;
function getSdk() {
  if (!sdk) sdk = new PrivacyPoolSDK(new Circuits({ browser: false }));
  return sdk;
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    network: process.env.CHAIN_NAME ?? "Ethereum mainnet",
    sdk: "ready",
    relayConfigured: Boolean(
      process.env.RELAYER_RPC_URL &&
        process.env.RELAYER_PRIVATE_KEY &&
        process.env.ENTRYPOINT_ADDRESS,
    ),
  });
});

app.get("/api/quote", (_req, res) => {
  const feeBps = BigInt(process.env.RELAY_FEE_BPS ?? "30");
  res.json({
    feeBps: Number(feeBps) / 100,
    feeLabel: `${Number(feeBps) / 100}%`,
    gasCovered: true,
    relayer: process.env.RELAYER_NAME ?? "F5",
  });
});

app.post("/api/relayer/quote", async (req, res) => {
  if (!process.env.RELAYER_API_URL) return res.status(503).json({ error: "RELAYER_API_URL is not configured" });
  try {
    const response = await fetch(`${process.env.RELAYER_API_URL.replace(/\/$/, "")}/relayer/quote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req.body) });
    return res.status(response.status).json(await response.json());
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Relayer quote unavailable" });
  }
});

app.post("/api/relayer/request", async (req, res) => {
  if (!process.env.RELAYER_API_URL) return res.status(503).json({ error: "RELAYER_API_URL is not configured" });
  try {
    const response = await fetch(`${process.env.RELAYER_API_URL.replace(/\/$/, "")}/relayer/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req.body) });
    return res.status(response.status).json(await response.json());
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Relay request unavailable" });
  }
});

app.get("/api/config", (_req, res) => {
  res.json({
    chainId: Number(process.env.CHAIN_ID ?? 1),
    chainName: process.env.CHAIN_NAME ?? "Ethereum mainnet",
    rpcUrl: process.env.PUBLIC_RPC_URL ?? "",
    poolAddress: process.env.POOL_ADDRESS ?? "",
    scope: process.env.POOL_SCOPE ?? "",
    asset: process.env.ASSET_ADDRESS ?? "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    symbol: process.env.ASSET_SYMBOL ?? "ETH",
    decimals: Number(process.env.ASSET_DECIMALS ?? 18),
    minDepositWei: process.env.MIN_DEPOSIT_WEI ?? "0",
    maxDepositWei: ((1n << 128n) - 1n).toString(),
    vettingFeeBps: Number(process.env.VETTING_FEE_BPS ?? 0),
  });
});

app.get("/api/activity", async (_req, res) => {
  const rpcUrl = process.env.PUBLIC_RPC_URL;
  const poolAddress = process.env.POOL_ADDRESS;
  if (!rpcUrl || !poolAddress) return res.json({ configured: false, deposits: [], withdrawals: [] });

  try {
    const chainId = Number(process.env.CHAIN_ID ?? 1);
    const data = new DataService([{ chainId, privacyPoolAddress: poolAddress, startBlock: BigInt(process.env.DEPLOYMENT_BLOCK ?? "0"), rpcUrl }]);
    const pool = { chainId, address: poolAddress, scope: 0n, deploymentBlock: BigInt(process.env.DEPLOYMENT_BLOCK ?? "0") };
    const [deposits, withdrawals] = await Promise.all([data.getDeposits(pool), data.getWithdrawals(pool)]);
    return res.json({ configured: true, deposits: deposits.slice(-12).map((event) => ({ ...event, value: event.value.toString(), blockNumber: event.blockNumber.toString() })), withdrawals: withdrawals.slice(-12).map((event) => ({ ...event, withdrawn: event.withdrawn.toString(), blockNumber: event.blockNumber.toString() })) });
  } catch (error) {
    return res.status(502).json({ configured: true, error: error instanceof Error ? error.message : "Unable to read activity", deposits: [], withdrawals: [] });
  }
});

app.get("/api/deposits/:hash", async (req, res) => {
  const rpcUrl = process.env.PUBLIC_RPC_URL;
  const poolAddress = process.env.POOL_ADDRESS;
  if (!rpcUrl || !poolAddress) return res.status(503).json({ error: "Pool indexing is not configured" });
  try {
    const chainId = Number(process.env.CHAIN_ID ?? 1);
    const data = new DataService([{ chainId, privacyPoolAddress: poolAddress, startBlock: BigInt(process.env.DEPLOYMENT_BLOCK ?? "0"), rpcUrl }]);
    const pool = { chainId, address: poolAddress, scope: 0n, deploymentBlock: BigInt(process.env.DEPLOYMENT_BLOCK ?? "0") };
    const deposits = await data.getDeposits(pool);
    const event = deposits.find((item) => item.transactionHash.toLowerCase() === req.params.hash.toLowerCase());
    if (!event) return res.status(202).json({ status: "pending" });
    return res.json({ status: "confirmed", event: { ...event, commitment: event.commitment.toString(), label: event.label.toString(), value: event.value.toString(), precommitment: event.precommitment.toString(), blockNumber: event.blockNumber.toString() } });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Unable to reconcile deposit" });
  }
});

app.get("/api/l1/state-proof/:commitment", async (req, res) => {
  const rpcUrl = process.env.PUBLIC_RPC_URL;
  const poolAddress = process.env.POOL_ADDRESS;
  if (!rpcUrl || !poolAddress) return res.status(503).json({ error: "L1 pool indexing is not configured" });
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const event = { type: "event", name: "LeafInserted", inputs: [{ name: "_index", type: "uint256", indexed: false }, { name: "_leaf", type: "uint256", indexed: false }, { name: "_root", type: "uint256", indexed: false }] };
    const logs = await client.getLogs({ address: poolAddress, event, fromBlock: BigInt(process.env.DEPLOYMENT_BLOCK ?? "0"), toBlock: "latest" });
    const ordered = logs.sort((a, b) => Number(a.args._index - b.args._index));
    const leaves = ordered.map((log) => log.args._leaf);
    const commitment = BigInt(req.params.commitment);
    const tree = new LeanIMT((left, right) => poseidon([left, right]));
    tree.insertMany(leaves);
    const index = tree.indexOf(commitment);
    if (index < 0) return res.status(404).json({ error: "Commitment is not in the L1 state tree" });
    const proof = tree.generateProof(index);
    const currentRoot = await client.readContract({ address: poolAddress, abi: [{ type: "function", name: "currentRoot", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }], functionName: "currentRoot" });
    if (tree.root !== currentRoot) return res.status(409).json({ error: "Indexed L1 state root is stale", indexedRoot: tree.root.toString(), onchainRoot: currentRoot.toString() });
    return res.json({ root: proof.root.toString(), depth: tree.depth, proof: { index: proof.index, siblings: proof.siblings.map((item) => item.toString()), root: proof.root.toString() } });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Unable to reconstruct L1 state tree" });
  }
});

app.get("/api/asp/proof/:label", async (req, res) => {
  const provider = process.env.ASP_API_URL || process.env.RELAYER_API_URL;
  if (!provider) return res.status(503).json({ error: "ASP_API_URL or RELAYER_API_URL is not configured" });
  try {
    const endpoint = process.env.ASP_API_URL
      ? `${provider.replace(/\/$/, "")}/proof?chainId=${encodeURIComponent(process.env.CHAIN_ID ?? "1")}&label=${encodeURIComponent(req.params.label)}`
      : `${provider.replace(/\/$/, "")}/relayer/asp/proof/${encodeURIComponent(req.params.label)}?chainId=${encodeURIComponent(process.env.CHAIN_ID ?? "1")}`;
    const response = await fetch(endpoint);
    return res.status(response.status).json(await response.json());
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "ASP provider unavailable" });
  }
});

app.get("/api/mode3/index", async (_req, res) => {
  const l1Rpc = process.env.PUBLIC_RPC_URL;
  const l2Rpc = process.env.L2_RPC_URL;
  const l1Pool = process.env.POOL_ADDRESS;
  const l2Pool = process.env.L2_POOL_ADDRESS;
  if (!l1Rpc || !l2Rpc || !l1Pool || !l2Pool) return res.json({ configured: false, candidates: [], proofs: [] });

  try {
    const l1ChainId = Number(process.env.CHAIN_ID ?? 1);
    const l2ChainId = Number(process.env.L2_CHAIN_ID ?? 10);
    const startBlock = BigInt(process.env.DEPLOYMENT_BLOCK ?? "0");
    const l2StartBlock = BigInt(process.env.L2_DEPLOYMENT_BLOCK ?? "0");
    const l1Data = new DataService([{ chainId: l1ChainId, privacyPoolAddress: l1Pool, startBlock, rpcUrl: l1Rpc }]);
    const l2Data = new DataService([{ chainId: l2ChainId, privacyPoolAddress: l2Pool, startBlock: l2StartBlock, rpcUrl: l2Rpc }]);
    const l1 = { chainId: l1ChainId, address: l1Pool, scope: 0n, deploymentBlock: startBlock };
    const l2 = { chainId: l2ChainId, address: l2Pool, scope: 0n, deploymentBlock: l2StartBlock };
    const [deliveries, received, activated] = await Promise.all([
      l1Data.getL2Notes(l1),
      l2Data.getL2NotesReceived(l2),
      l2Data.getL2NotesActivated(l2),
    ]);
    const candidates = l1Data.buildScannableNotes(deliveries, received);
    const tree = l2Data.reconstructL2StateTree(activated);
    const proofs = activated.map((event) => {
      const index = tree.indexOf(event.commitment);
      return { commitment: event.commitment.toString(), index, proof: index >= 0 ? tree.generateProof(index) : null };
    });
    return res.json({ configured: true, stateRoot: tree.root.toString(), candidates: candidates.map((note) => ({ ...note, commitment: note.commitment.toString(), value: note.value.toString(), ephemeralKey: note.ephemeralKey.map((part) => part.toString()) })), proofs: JSON.parse(JSON.stringify(proofs, (_key, value) => typeof value === "bigint" ? value.toString() : value)) });
  } catch (error) {
    return res.status(502).json({ configured: true, error: error instanceof Error ? error.message : "Unable to index Mode-3 notes", candidates: [], proofs: [] });
  }
});

app.get("/api/mode3/status/:commitment", async (req, res) => {
  const rpcUrl = process.env.L2_RPC_URL;
  const l2Pool = process.env.L2_POOL_ADDRESS;
  if (!rpcUrl || !l2Pool) return res.status(503).json({ error: "L2 pool is not configured" });
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const abi = [
      { type: "function", name: "receivedCommitments", stateMutability: "view", inputs: [{ name: "commitment", type: "uint256" }], outputs: [{ type: "bool" }] },
      { type: "function", name: "pendingValue", stateMutability: "view", inputs: [{ name: "commitment", type: "uint256" }], outputs: [{ type: "uint256" }] },
      { type: "function", name: "currentRoot", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
    ];
    const commitment = BigInt(req.params.commitment);
    const [received, pendingValue, currentRoot] = await Promise.all([
      client.readContract({ address: l2Pool, abi, functionName: "receivedCommitments", args: [commitment] }),
      client.readContract({ address: l2Pool, abi, functionName: "pendingValue", args: [commitment] }),
      client.readContract({ address: l2Pool, abi, functionName: "currentRoot" }),
    ]);
    return res.json({ received, pendingValue: pendingValue.toString(), currentRoot: currentRoot.toString(), state: !received ? "bridge-pending" : pendingValue > 0n ? "received-pending-activation" : "activated" });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Unable to read L2 status" });
  }
});

app.post("/api/l2/activate", async (req, res) => {
  const rpcUrl = process.env.L2_RPC_URL;
  const poolAddress = process.env.L2_POOL_ADDRESS;
  const privateKey = process.env.L2_RELAYER_PRIVATE_KEY;
  const entrypoint = process.env.L2_ENTRYPOINT_ADDRESS ?? process.env.ENTRYPOINT_ADDRESS;
  if (!rpcUrl || !poolAddress || !privateKey || !entrypoint) return res.status(503).json({ error: "L2 activation is not configured" });
  try {
    const chain = { id: Number(process.env.L2_CHAIN_ID ?? 10), name: process.env.L2_CHAIN_NAME ?? "Configured L2", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } };
    const interactions = getSdk().createContractInstance(rpcUrl, chain, entrypoint, privateKey);
    const transaction = await interactions.activateNote(poolAddress, BigInt(req.body.commitment));
    return res.json({ hash: transaction.hash });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "L2 activation failed" });
  }
});

app.post("/api/l2/withdraw", async (req, res) => {
  const rpcUrl = process.env.L2_RPC_URL;
  const poolAddress = process.env.L2_POOL_ADDRESS;
  const privateKey = process.env.L2_RELAYER_PRIVATE_KEY;
  const entrypoint = process.env.L2_ENTRYPOINT_ADDRESS ?? process.env.ENTRYPOINT_ADDRESS;
  if (!rpcUrl || !poolAddress || !privateKey || !entrypoint) return res.status(503).json({ error: "L2 withdrawal is not configured" });
  try {
    const chain = { id: Number(process.env.L2_CHAIN_ID ?? 10), name: process.env.L2_CHAIN_NAME ?? "Configured L2", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } };
    const interactions = getSdk().createContractInstance(rpcUrl, chain, entrypoint, privateKey);
    const transaction = await interactions.withdrawL2(poolAddress, req.body.withdrawal, req.body.proof);
    return res.json({ hash: transaction.hash });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "L2 withdrawal failed" });
  }
});

app.post("/api/proofs/commitment", async (req, res) => {
  try {
    const { value, label, nullifier, secret } = req.body ?? {};
    if ([value, label, nullifier, secret].some((item) => item === undefined)) {
      return res.status(400).json({ error: "value, label, nullifier and secret are required" });
    }

    const proof = await getSdk().proveCommitment(
      BigInt(value),
      BigInt(label),
      BigInt(nullifier),
      BigInt(secret),
    );
    return res.json({ proof });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Commitment proof failed",
      hint: "Circuit artifacts must be present in the SDK distribution.",
    });
  }
});

app.post("/api/proofs/verify", async (req, res) => {
  try {
    const valid = await getSdk().verifyCommitment(req.body);
    return res.json({ valid });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Verification failed" });
  }
});

app.post("/api/relay", async (req, res) => {
  const required = ["withdrawal", "proof", "scope"];
  if (required.some((key) => req.body?.[key] === undefined)) {
    return res.status(400).json({ error: "withdrawal, proof and scope are required" });
  }

  if (!process.env.RELAYER_RPC_URL || !process.env.RELAYER_PRIVATE_KEY || !process.env.ENTRYPOINT_ADDRESS) {
    return res.status(503).json({
      error: "Relay submission is not configured",
      required: ["RELAYER_RPC_URL", "RELAYER_PRIVATE_KEY", "ENTRYPOINT_ADDRESS"],
    });
  }

  try {
    const chain = {
      id: Number(process.env.CHAIN_ID ?? 1),
      name: process.env.CHAIN_NAME ?? "Configured chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [process.env.RELAYER_RPC_URL] } },
    };
    const interactions = getSdk().createContractInstance(
      process.env.RELAYER_RPC_URL,
      chain,
      process.env.ENTRYPOINT_ADDRESS,
      process.env.RELAYER_PRIVATE_KEY,
    );
    const transaction = await interactions.relay(
      req.body.withdrawal,
      req.body.proof,
      BigInt(req.body.scope),
    );
    return res.json({ hash: transaction.hash });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Relay failed" });
  }
});

app.listen(port, () => console.log(`F5 API listening on :${port}`));
