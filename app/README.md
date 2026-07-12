# F5 relayer app

This is the reference UI and API boundary for an F5-style privacy-pool relayer.

## Run locally

From the repository root:

```bash
yarn install
cp app/.env.example app/.env
yarn --cwd app dev
```

The app is intentionally not a root Yarn workspace. It uses the repository’s existing `node_modules` during local development, so installing the core packages does not require resolving a second app dependency graph.

The Vite client runs on port `5173`; the API runs on port `8787`.

The `dev` script starts both processes with a small Node runner, so no global `concurrently` installation is required. Vite hot-reloads the client; restart the API manually after server changes.

## Configuration

Set `PUBLIC_RPC_URL`, `POOL_ADDRESS`, and `DEPLOYMENT_BLOCK` to enable SDK-backed pool activity and user deposits. Set the `L2_*` values to enable Mode-3 note indexing, bridge status, and reconstructed L2 Merkle proofs. Set `RELAYER_API_URL` to proxy the existing relayer quote/request API; the standalone app relay fallback also accepts `RELAYER_RPC_URL`, `RELAYER_PRIVATE_KEY`, and `ENTRYPOINT_ADDRESS`.

For the repository’s recorded Sepolia deployment, start from `app/.env.sepolia.example` and replace the relayer RPC and key. The L2 Mode-3 variables remain deployment-specific because this repository does not include an L2 pool deployment.

The browser generates the commitment preimage and sends the deposit from the connected wallet. Note material is encrypted locally with AES-GCM using a key derived from a wallet signature; the relayer never receives the note secret.

The production relay API is the existing TypeScript service in `packages/relayer`. From the
repository root, copy `packages/relayer/config.sepolia.example.json` to a private config file,
fill in the deployed Entrypoint, fee receiver, and relayer key, then run:

```bash
CONFIG_PATH=/absolute/path/to/config.sepolia.json PORT=8788 \
  yarn workspace @privacy-pool-core/relayer build:start
```

The app proxies `/api/relayer/quote` and `/api/relayer/request` to that service. Its direct
`/api/relay` route is retained as an SDK-backed fallback and must never be exposed without a
server-side relayer key.
