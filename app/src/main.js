import "./style.css";
import { createPublicClient, createWalletClient, custom, formatEther, parseEther } from "viem";

const state = { mode: "deposit", amount: "1", status: "idle", account: "", activity: null, config: null, notes: [], relayDraft: null, bridgeStatus: null };
const app = document.querySelector("#app");
const poolAbi = [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [{ name: "precommitment", type: "uint256" }], outputs: [] }];

const icons = {
  mark: `<span class="mark">///</span>`,
  eth: `<span class="eth">Ξ</span>`,
  check: `<span class="check">✓</span>`,
};

function render() {
  if (location.hash !== "#relay") return renderLanding();
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#"><span class="brand-mark">${icons.mark}</span><span>F5</span><span class="tag pink">RELAYER NODE</span></a>
      <nav><a class="active" href="#relay">Relay</a><a href="#pools">Pools</a><a href="#activity">Activity</a><a href="#docs">Docs</a></nav>
      <div class="wallet"><button class="network"><i class="dot blue"></i> Ethereum <span>⌄</span></button><button id="connect" class="account">${state.account ? `${state.account.slice(0, 6)}...${state.account.slice(-4)}` : "CONNECT WALLET"}</button></div>
    </header>
    <main>
      <section class="workspace">
        <div class="scribble teal">〰</div>
        <section class="panel composer">
          <span class="sticker teal sticker-top">SHIELDED ★</span>
          <div class="tabs"><button class="${state.mode === "deposit" ? "selected" : ""}" data-mode="deposit">DEPOSIT</button><button class="${state.mode === "withdraw" ? "selected" : ""}" data-mode="withdraw">WITHDRAW</button></div>
          ${state.mode === "deposit" ? depositView() : withdrawView()}
        </section>
        <aside class="aside">
          <section class="node-card blue-card"><div class="card-heading"><h2>THE NODE</h2><span class="online"><i class="dot teal-dot"></i> ONLINE</span></div><p>F5 is one of many independent relayers. It signs your withdrawal, pays the gas, keeps nothing — and can’t steal a wei even if it wanted to.</p><div class="node-facts"><span>NO LOGS KEPT</span><span>GAS PAID BY F5</span></div></section>
          <section class="panel notes"><div class="card-heading"><h2>YOUR NOTES</h2><div><button id="unlock-notes" class="unlock">UNLOCK</button><span class="sticker teal small">ENCRYPTED</span></div></div><div id="note-list">${notesView()}</div></section>
        </aside>
      </section>
      <section class="how"><span class="eyebrow teal-text">THE SIMPLE VERSION</span><h2>THREE SPINS & YOU’RE GONE <span class="blue-text">〰</span></h2><div class="steps">${step("1", "PROVE IT, PRIVATELY", "Your zero-knowledge proof is generated on your device. F5 never sees your note, your secret, or your face.", "CLIENT-SIDE PROOF", "yellow")}${step("2", "WE HIT THE BUTTON", "F5 broadcasts the withdrawal from its own address and covers the gas. Your new wallet needs zero history.", "RELAYED · GAS PAID", "pink")}${step("3", "LAND SOMEWHERE NEW", "Funds arrive at a fresh address with nothing upstream. The pool remembers a crowd — not you.", "UNLINKABLE", "teal")}</div></section>
    </main>
    <footer><span>© 2026 F5 — A NODE TO TORNADO CASH</span><span><a href="#docs">Litepaper</a> <a class="run" href="#relay">Run the relay ↗</a></span></footer>
  `;
  app.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => { state.mode = button.dataset.mode; render(); }));
  app.querySelector("#amount")?.addEventListener("input", (event) => { state.amount = event.target.value; });
  app.querySelector("#connect")?.addEventListener("click", connectWallet);
  app.querySelector("#unlock-notes")?.addEventListener("click", unlockNotes);
  app.querySelector("#action")?.addEventListener("click", submitFlow);
  loadConfig();
  loadActivity();
}

function renderLanding() {
  app.innerHTML = `
    <header class="topbar landing-topbar">
      <a class="brand" href="#"><span class="brand-mark">${icons.mark}</span><span>F5</span><span class="tag pink">A NODE TO TORNADO CASH</span></a>
      <nav><a class="active teal-underline" href="#">Protocol</a><a class="yellow-underline" href="#">Relayers</a><a class="pink-underline" href="#docs">Docs</a><a class="launch" href="#relay">LAUNCH APP ↗</a></nav>
    </header>
    <main class="landing">
      <section class="hero"><div class="hero-copy"><span class="sticker teal hero-sticker">★ THE HIGHEST CATEGORY ★</span><h1>BLOW AWAY<br>YOUR <span>TRAIL</span></h1><p>F5 is an independent relayer node for Tornado Cash. We broadcast your withdrawal and pay the gas — so your fresh wallet stays fresh, and nothing on-chain points back at you.</p><div class="hero-actions"><a class="primary hero-primary" href="#relay">RELAY A WITHDRAWAL →</a><a class="secondary" href="#how">HOW IT WORKS</a></div><div class="node-pill"><i class="dot teal-dot"></i> NODE ONLINE · MAINNET</div></div><div class="hero-art"><div class="art-dots"></div><div class="trail-bars"><i class="bar blue-bar"></i><i class="bar teal-bar"></i><i class="bar yellow-bar"></i><i class="bar pink-bar"></i><i class="bar orange-bar"></i><i class="bar blue-bar short"></i><i class="bar teal-bar tiny"></i><b></b></div><span class="figure-label">FIG. 01 — CATEGORY F5</span></div></section>
      <section id="how" class="how landing-how"><span class="eyebrow teal-text">THE SIMPLE VERSION</span><h2>THREE SPINS & YOU’RE GONE <span class="blue-text">〰</span></h2><div class="steps">${step("1", "PROVE IT, PRIVATELY", "Your zero-knowledge proof is generated on your device. F5 never sees your note, your secret, or your face.", "CLIENT-SIDE PROOF", "yellow")}${step("2", "WE HIT THE BUTTON", "F5 broadcasts the withdrawal from its own address and covers the gas. Your new wallet needs zero history.", "RELAYED · GAS PAID", "pink")}${step("3", "LAND SOMEWHERE NEW", "Funds arrive at a fresh address with nothing upstream. The pool remembers a crowd — not you.", "UNLINKABLE", "teal")}</div></section>
      <div class="ticker">NO LOGS ★ NO ADMIN KEYS ★ NON-CUSTODIAL ★ GAS PAID BY THE STORM ★ NO LOGS ★ NO ADMIN KEYS ★</div>
    </main>
    <footer><span>© 2026 F5 — A NODE TO TORNADO CASH</span><span><a href="#docs">Litepaper</a><a class="run" href="#relay">Run the relay ↗</a></span></footer>
  `;
}

function depositView() { const config = state.config; const minimum = config?.minDepositWei && config.minDepositWei !== "0" ? `${formatEther(BigInt(config.minDepositWei))} ${config.symbol}` : "no configured minimum"; return `<div class="field-label"><span>FROM</span><span><i class="dot blue"></i> ${config?.chainName ?? "CONFIGURED NETWORK"}</span></div><div class="amount-field"><div><input id="amount" value="${state.amount}" inputmode="decimal" /><small id="amount-help">Any amount · minimum ${minimum}</small></div><button class="asset">${icons.eth} ${config?.symbol ?? "ETH"}⌄</button></div><div class="field-label pool-label"><span>VARIABLE AMOUNT</span><span>${config ? `${config.vettingFeeBps / 100}% VETTING FEE` : "LOADING CONFIG"}</span></div><div class="direction">↓</div><div class="notice pink-card"><strong>INTO THE TORNADO</strong><span>Your note joins the pool at the amount you choose. Only your secret can pull it back out.</span></div><button id="action" class="primary">DEPOSIT TO POOL →</button><div class="micro">amount privacy depends on the pool crowd　★　non-custodial　★　note saved locally</div>`; }
function withdrawView() { const selected = state.notes[0]; const draft = state.relayDraft; return `<div class="flow-step active"><span class="flow-number">01</span><div><span class="eyebrow">L1 · ETHEREUM</span><h3>BRIDGE A NOTE</h3><p>${selected ? `${formatEther(BigInt(selected.value))} ETH note selected.` : "Unlock a local note to begin."}</p></div></div><label class="input-label">BRIDGE TARGET<select id="destination-chain"><option value="10">Optimism</option><option value="11155420">OP Sepolia</option></select></label><label class="input-label">FINAL RECIPIENT ADDRESS<input id="destination" placeholder="0x... fresh L2 wallet address" /></label><label class="input-label">RECIPIENT SHIELDED SPEND KEY B<input id="shielded-b" placeholder="x,y Baby Jubjub point" /></label><label class="input-label">RECIPIENT SHIELDED VIEW KEY V<input id="shielded-v" placeholder="x,y Baby Jubjub point" /></label><div class="flow-step ${draft ? "active" : "muted-step"}"><span class="flow-number">02</span><div><span class="eyebrow">L2 · DESTINATION</span><h3>WITHDRAW ON L2</h3><p>${draft ? (state.bridgeStatus?.state === "activated" ? "Note activated. Ready for the L2 proof." : "Waiting for the bridge note and backing to arrive.") : "Unlocks after the Ethereum relay confirms."}</p></div></div><div class="notice teal-card"><strong>${draft?.l1Response ? "L1 RELAY SUBMITTED" : draft?.proof ? "L1 PROOF READY" : draft ? "L1 RELAY QUOTED" : "TWO TRANSACTIONS, ONE FLOW"}</strong><span>${draft ? "The destination note is derived locally. The next step waits for the bridge to deliver and activate it." : "F5 first burns the Ethereum note and bridges it to the target L2. Only after activation can the L2 withdrawal be proven."}</span></div><button id="action" class="primary" ${selected ? "" : "disabled"}>${draft?.l1Response ? "REFRESH L2 STATUS →" : draft?.proof ? "SUBMIT L1 RELAY →" : draft ? "GENERATE L1 PROOF →" : "QUOTE L1 RELAY →"}</button><div class="micro">L1 proof and L2 proof are separate　★　bridge delivery is asynchronous</div>`; }
function note(amount, hash, action, muted = false) { return `<div class="note ${muted ? "muted" : ""}"><span class="note-icon">${muted ? icons.check : icons.eth}</span><div><strong>${amount}</strong><small>note ${hash}　·　in pool</small></div><b>${action}</b></div>`; }
function notesView() { return state.notes.length ? state.notes.map((item) => note(`${formatEther(BigInt(item.value))} ETH`, `${item.commitment.slice(0, 6)}...${item.commitment.slice(-4)}`, "READY →")).join("") : `<div class="note-empty">No unlocked notes on this device.<br><span>Connect the wallet that created a deposit, then unlock your local vault.</span></div>`; }
function step(number, title, body, foot, color) { return `<article class="step ${color}"><span class="number">${number}</span><h3>${title}</h3><p>${body}</p><small>→ ${foot}</small></article>`; }
async function connectWallet() {
  if (!window.ethereum) return alert("Install an Ethereum wallet to continue.");
  const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
  state.account = account;
  render();
}

async function loadActivity() {
  try {
    const response = await fetch("/api/activity");
    const activity = await response.json();
    if (!response.ok) return;
    state.activity = activity;
  } catch { /* The static note view is the intentional offline fallback. */ }
}

async function unlockNotes() {
  if (!window.ethereum) return alert("Connect an Ethereum wallet to unlock notes.");
  if (!state.account) await connectWallet();
  const button = app.querySelector("#unlock-notes");
  if (button) button.textContent = "UNLOCKING...";
  try {
    const wallet = createWalletClient({ account: state.account, transport: custom(window.ethereum) });
    const signature = await wallet.signMessage({ account: state.account, message: "F5 note vault key — sign once to unlock your local notes." });
    const key = await keyFromSignature(signature, "decrypt");
    const unlocked = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith("f5-note-")) continue;
      try {
        const envelope = JSON.parse(localStorage.getItem(storageKey));
        if (envelope.wallet?.toLowerCase() !== state.account.toLowerCase()) continue;
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(envelope.iv) }, key, new Uint8Array(envelope.ciphertext));
        unlocked.push(JSON.parse(new TextDecoder().decode(plaintext)));
      } catch { /* Ignore notes encrypted by another wallet/key. */ }
    }
    state.notes = unlocked;
    const list = app.querySelector("#note-list");
    if (list) list.innerHTML = notesView();
    if (button) button.textContent = unlocked.length ? `${unlocked.length} UNLOCKED` : "UNLOCK";
  } catch (error) {
    if (button) button.textContent = "UNLOCK";
    if (error?.code !== 4001) alert(error instanceof Error ? error.message : "Unable to unlock notes.");
  }
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    state.config = await response.json();
    const amountHelp = app.querySelector("#amount-help");
    if (amountHelp && state.config.minDepositWei !== "0") amountHelp.textContent = `Any amount · minimum ${formatEther(BigInt(state.config.minDepositWei))} ${state.config.symbol}`;
  } catch { /* The user can still inspect the UI while the API is offline. */ }
}

function randomField() {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return BigInt(`0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}

async function submitFlow() {
  const button = app.querySelector("#action");
  button.disabled = true;
  button.textContent = state.mode === "deposit" ? "SAVING NOTE..." : "CHECKING RELAYER...";
  state.status = "working";
  try {
    if (state.mode === "deposit") {
      if (!window.ethereum) throw new Error("Connect an Ethereum wallet first.");
      if (!state.account) await connectWallet();
      const config = await (await fetch("/api/config")).json();
      if (!config.poolAddress) throw new Error("POOL_ADDRESS is not configured on the API.");
      const nullifier = randomField();
      const secret = randomField();
      let value;
      try { value = parseEther(state.amount); } catch { throw new Error("Enter a valid amount."); }
      if (value <= 0n) throw new Error("Amount must be greater than zero.");
      if (value < BigInt(config.minDepositWei)) throw new Error(`Amount is below the pool minimum of ${formatEther(BigInt(config.minDepositWei))} ${config.symbol}.`);
      if (value > BigInt(config.maxDepositWei)) throw new Error("Amount exceeds the protocol deposit limit.");
      const { hashPrecommitment } = await import("@0xbow/privacy-pools-core-sdk");
      const precommitment = hashPrecommitment(nullifier, secret);
      const wallet = createWalletClient({ account: state.account, chain: { id: config.chainId, name: config.chainName, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [config.rpcUrl || "https://cloudflare-eth.com"] } } }, transport: custom(window.ethereum) });
      const publicClient = createPublicClient({ chain: { id: config.chainId, name: config.chainName, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [config.rpcUrl || "https://cloudflare-eth.com"] } } }, transport: custom(window.ethereum) });
      const balance = await publicClient.getBalance({ address: state.account });
      if (balance < value) throw new Error(`Insufficient ${config.symbol} balance.`);
      const hash = await wallet.writeContract({ address: config.poolAddress, abi: poolAbi, functionName: "deposit", args: [precommitment], value });
      button.textContent = "CONFIRMING DEPOSIT EVENT...";
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Deposit transaction reverted.");
      const event = await reconcileDeposit(hash);
      const noteData = { value: event.value, label: event.label, nullifier: nullifier.toString(), secret: secret.toString(), precommitment: precommitment.toString(), commitment: event.commitment, txHash: hash, savedAt: Date.now() };
      const encryptedNote = await encryptNote(wallet, noteData);
      localStorage.setItem(`f5-note-${event.commitment}`, JSON.stringify(encryptedNote));
      state.notes = [...state.notes, noteData];
      const list = app.querySelector("#note-list");
      if (list) list.innerHTML = notesView();
      button.textContent = `DEPOSIT CONFIRMED · ${formatEther(BigInt(event.value))} ${config.symbol} NOTE SAVED`;
      state.activity = null;
      loadActivity();
  } else {
      const selected = state.notes[0];
      if (!selected) throw new Error("Unlock a local note before starting a withdrawal.");
      if (state.relayDraft?.proof) {
        const relayRequest = {
          withdrawal: state.relayDraft.withdrawal,
          publicSignals: state.relayDraft.proof.publicSignals.map(String),
          proof: { pi_a: state.relayDraft.proof.proof.pi_a, pi_b: state.relayDraft.proof.proof.pi_b, pi_c: state.relayDraft.proof.proof.pi_c },
          scope: state.relayDraft.scope,
          chainId: state.config?.chainId,
          feeCommitment: state.relayDraft.feeCommitment,
        };
        const response = await fetch("/api/relayer/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(relayRequest) });
        const result = await response.json();
        if (!response.ok || result.success === false) throw new Error(result.error ?? "L1 relay request failed.");
        state.relayDraft.l1Response = result;
        button.textContent = "L1 RELAY SUBMITTED · WAITING FOR BRIDGE";
        await refreshBridgeStatus();
        render();
        return;
      }
      if (state.relayDraft) {
        await refreshBridgeStatus();
        render();
        return;
      }
      const recipient = app.querySelector("#destination")?.value?.trim();
      const shieldedB = parsePoint(app.querySelector("#shielded-b")?.value);
      const shieldedV = parsePoint(app.querySelector("#shielded-v")?.value);
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient ?? "")) throw new Error("Enter a valid final recipient address.");
      if (!shieldedB || !shieldedV) throw new Error("Enter both shielded Baby Jubjub points as x,y.");
      const destinationChainId = BigInt(app.querySelector("#destination-chain")?.value ?? "10");
      if (!state.config?.scope) throw new Error("POOL_SCOPE is not configured on the API.");
      const { Circuits, NoteService, PrivacyPoolSDK, calculateRelayContext } = await import("@0xbow/privacy-pools-core-sdk");
      const ephemeralScalar = randomField();
      const noteService = new NoteService();
      const quoteNote = noteService.buildDestNote({ B: shieldedB, V: shieldedV }, BigInt(selected.value), ephemeralScalar);
      const quoteResponse = await fetch("/api/relayer/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chainId: state.config?.chainId ?? 1, amount: selected.value, asset: state.config?.asset, recipient, ephemeralKey: quoteNote.ephemeralKey.map(String), viewTag: quoteNote.viewTag.toString(), extraGas: false }) });
      const quote = await quoteResponse.json();
      if (!quoteResponse.ok) throw new Error(quote.error ?? "Relayer quote unavailable.");
      if (!quote.feeCommitment?.withdrawalData) throw new Error("Relayer did not return a signed fee commitment.");
      const feeBps = BigInt(quote.feeBPS ?? 0);
      const bridgedValue = BigInt(selected.value) - ((BigInt(selected.value) * feeBps) / 10_000n);
      if (bridgedValue <= 0n) throw new Error("Relay fee leaves no value to bridge.");
      const destNote = noteService.buildDestNote({ B: shieldedB, V: shieldedV }, bridgedValue, ephemeralScalar);
      const withdrawal = { chainId: destinationChainId, data: quote.feeCommitment.withdrawalData };
      const [stateResponse, aspResponse] = await Promise.all([fetch(`/api/l1/state-proof/${selected.commitment}`), fetch(`/api/asp/proof/${selected.label}`)]);
      const stateProof = await stateResponse.json();
      const aspProof = await aspResponse.json();
      if (!stateResponse.ok) throw new Error(stateProof.error ?? "L1 state proof unavailable.");
      if (!aspResponse.ok) throw new Error(aspProof.error ?? "ASP proof unavailable.");
      const sdk = new PrivacyPoolSDK(new Circuits({ browser: true, baseUrl: `${window.location.origin}/api/circuits/` }));
      const commitment = { hash: BigInt(selected.commitment), value: BigInt(selected.value), label: BigInt(selected.label), nullifier: BigInt(selected.nullifier), secret: BigInt(selected.secret) };
      const context = BigInt(calculateRelayContext(withdrawal, BigInt(state.config.scope)));
      const l1Proof = await sdk.proveWithdrawalL1(commitment, { context, withdrawnValue: BigInt(selected.value), bridgedValue, stateMerkleProof: stateProof.proof, stateRoot: BigInt(stateProof.root), stateTreeDepth: BigInt(stateProof.depth), aspMerkleProof: aspProof.proof, aspRoot: BigInt(aspProof.root), aspTreeDepth: BigInt(aspProof.depth), spendingPublicKey: shieldedB, sharedSecretX: destNote.sharedSecretX, newNullifier: randomField(), newSecret: randomField() });
      if (!(await sdk.verifyWithdrawalL1(l1Proof))) throw new Error("L1 proof verification failed.");
      state.relayDraft = { selected, recipient, destinationChainId: destinationChainId.toString(), destNote, ephemeralScalar: ephemeralScalar.toString(), quote, withdrawal, feeCommitment: quote.feeCommitment, scope: state.config.scope, proof: l1Proof };
      await refreshBridgeStatus();
      render();
  }
  } catch (error) {
    button.textContent = error instanceof Error ? error.message : "FLOW FAILED";
  } finally { button.disabled = false; }
}

function parsePoint(value) { const parts = (value ?? "").split(",").map((part) => part.trim()); return parts.length === 2 && parts.every((part) => /^\d+$/.test(part)) ? [BigInt(parts[0]), BigInt(parts[1])] : null; }

async function refreshBridgeStatus() {
  if (!state.relayDraft?.destNote?.cDest) return;
  try { const response = await fetch(`/api/mode3/status/${state.relayDraft.destNote.cDest.toString()}`); state.bridgeStatus = response.ok ? await response.json() : { state: "bridge-pending" }; } catch { state.bridgeStatus = { state: "bridge-pending" }; }
}

async function reconcileDeposit(hash) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await fetch(`/api/deposits/${hash}`);
    if (response.ok) return (await response.json()).event;
    if (response.status !== 202) throw new Error("Deposit confirmed, but event reconciliation failed.");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Deposit confirmed, but the pool event is still indexing.");
}

async function encryptNote(wallet, noteData) {
  const signature = await wallet.signMessage({ account: state.account, message: "F5 note vault key — sign once to encrypt this note locally." });
  const key = await keyFromSignature(signature, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(noteData)));
  return { version: 1, algorithm: "AES-GCM", iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)], wallet: state.account };
}

async function keyFromSignature(signature, usage) {
  const signatureBytes = new Uint8Array(signature.slice(2).match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
  const digest = await crypto.subtle.digest("SHA-256", signatureBytes);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [usage]);
}

render();
window.addEventListener("hashchange", render);
