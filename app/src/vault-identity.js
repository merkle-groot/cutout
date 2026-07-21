import { renderIdenticon } from "./identicon.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function short(value) {
  const text = String(value);
  return text.length > 16 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

const PUBLISHED_ADDRESSES_KEY = "f5-published-addresses-v1";

function identityFingerprint(shielded) {
  const { B, V } = shielded;
  return `${B[0]},${B[1]}:${V[0]},${V[1]}`;
}

/**
 * The interchange string printed on the credential card and handed to the
 * COPY META-ADDRESS button. `cutout:eth:` — never the ERC-5564 `st:eth:`
 * prefix, which would invite a conformant stealth wallet to parse this
 * Baby Jubjub blob as secp256k1 and send real funds to a garbage address.
 * Four 32-byte big-endian limbs: B.x, B.y, V.x, V.y.
 */
/*
 * There is deliberately no meta-address handle on this card.
 *
 * `resolveRecipient` in main.js takes an L1 ADDRESS and reads the keys back out
 * of the ERC-6538 registry — nothing in this app ever parses a pasted
 * meta-address. Printing 256 hex characters gave the user a handle they could
 * not actually hand to a sender, and inviting them to copy it around is worse
 * than useless: the only tooling that would accept a string of that shape is a
 * conformant ERC-5564 wallet, which would read these Baby Jubjub limbs as
 * secp256k1 and derive a garbage address. The address below is the handle.
 * Anyone who genuinely needs raw key material has the per-key COPY buttons.
 */

export function cachedPublicationStatus(storage, account, shielded) {
  if (!storage || !shielded) return false;
  try {
    const published = JSON.parse(storage.getItem(PUBLISHED_ADDRESSES_KEY) ?? "{}");
    const fingerprint = identityFingerprint(shielded);
    return account
      ? published[account.toLowerCase()] === fingerprint
      : Object.values(published).includes(fingerprint);
  } catch {
    return false;
  }
}

export function storePublicationStatus(storage, account, shielded, published) {
  if (!storage || !account || !shielded) return;
  try {
    const values = JSON.parse(storage.getItem(PUBLISHED_ADDRESSES_KEY) ?? "{}");
    const key = account.toLowerCase();
    if (published) values[key] = identityFingerprint(shielded);
    else delete values[key];
    storage.setItem(PUBLISHED_ADDRESSES_KEY, JSON.stringify(values));
  } catch { /* localStorage can be unavailable in hardened browser modes */ }
}

/**
 * The shielded-address panel, styled as a ticket-stub credential card: a
 * perforated left stub carrying the identicon fingerprint, and the details
 * — holder, meta-address, both keys — on the right.
 */
export function renderVaultIdentityControls({ shielded, account, registered, busy }) {
  const { B, V } = shielded;
  const status = registered === true ? "PUBLISHED" : !account ? "CONNECT WALLET" : registered === false ? "NOT PUBLISHED" : "CHECKING";
  const statusControl = !account && registered !== true
    ? `<button type="button" class="online identity-connect" data-connect-wallet><i class="dot teal-dot"></i> ${status}</button>`
    : `<span class="online"><i class="dot teal-dot"></i> ${status}</span>`;
  const spendingKey = `${B[0]}, ${B[1]}`;
  const viewingKey = `${V[0]}, ${V[1]}`;
  const publishAction = registered === false
    ? `<button id="register-keys" class="secondary-btn" ${busy ? "disabled" : ""}>PUBLISH SHIELDED ADDRESS</button>`
    : "";
  const identityNote = registered === true
    ? "Your shielded address is published. Senders can resolve this wallet and deliver shielded notes directly to your vault. Your private keys and recovery phrase stay local."
    : "Publish your public shielded keys so senders can resolve your connected wallet and deliver shielded notes to this vault. Your private keys and recovery phrase stay local and are never published.";
  const holder = account ? escapeHtml(account) : "not connected";

  return `
    <section class="transit-identity credential-card" aria-labelledby="shielded-address-title">
      <div class="card-heading credential-heading">
        <h2 id="shielded-address-title">SHIELDED ADDRESS</h2>
        <span class="registry-badge">ERC-6538 REGISTERED</span>
        ${statusControl}
      </div>
      <p class="identity-copy identity-note">${identityNote}</p>
      <div class="credential-body">
        <div class="credential-stub">
          <span class="eyebrow">FINGERPRINT</span>
          ${renderIdenticon(shielded, { px: 120, label: "Your shielded address fingerprint" })}
          <p class="fingerprint-caption">check this matches on the recipient's device</p>
        </div>
        <div class="credential-perforation" aria-hidden="true"></div>
        <div class="credential-details">
          <div class="credential-field">
            <span class="eyebrow">HOLDER · YOUR ADDRESS · SENDERS RESOLVE THIS</span>
            <code>${holder}</code>
          </div>
          <div class="shielded-key-list">
            <div class="shielded-key-row">
              <span>SPENDING KEY</span>
              <div class="key-value"><code>${short(B[0])} · ${short(B[1])}</code><small>64 bytes · Baby Jubjub</small></div>
              <button type="button" data-copy-shielded="${escapeHtml(spendingKey)}" data-copy-label="Spending key">COPY</button>
            </div>
            <div class="shielded-key-row">
              <span>VIEWING KEY</span>
              <div class="key-value"><code>${short(V[0])} · ${short(V[1])}</code><small>64 bytes · Baby Jubjub</small></div>
              <button type="button" data-copy-shielded="${escapeHtml(viewingKey)}" data-copy-label="Viewing key">COPY</button>
            </div>
          </div>
          ${account
            ? `<button type="button" class="secondary-btn copy-meta-address" data-copy-shielded="${escapeHtml(account)}" data-copy-label="Address">COPY ADDRESS</button>`
            : `<button type="button" class="secondary-btn copy-meta-address" disabled>COPY ADDRESS</button>`}
        </div>
      </div>
      <div class="transit-identity-actions">${publishAction}<button id="reveal-mnemonic" class="secondary-btn">SHOW RECOVERY PHRASE</button></div>
      <div class="credential-footer">
        <span>REGISTRY · 0x6538…6538</span>
        <span>SCHEME · CUTOUT-BJJ</span>
        <span>BABY JUBJUB · POSEIDON</span>
      </div>
    </section>`;
}
