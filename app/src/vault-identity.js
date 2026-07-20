function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function short(value) {
  const text = String(value);
  return text.length > 16 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

export function renderVaultIdentityControls({ shielded, account, registered, busy }) {
  const { B, V } = shielded;
  const status = !account ? "CONNECT WALLET" : registered === true ? "PUBLISHED" : registered === false ? "NOT PUBLISHED" : "CHECKING";
  const spendingKey = `${B[0]}, ${B[1]}`;
  const viewingKey = `${V[0]}, ${V[1]}`;
  const publishAction = registered === false
    ? `<button id="register-keys" class="secondary-btn" ${busy ? "disabled" : ""}>PUBLISH SHIELDED ADDRESS</button>`
    : "";

  return `
    <section class="transit-identity" aria-labelledby="shielded-address-title">
      <div class="card-heading"><h2 id="shielded-address-title">SHIELDED ADDRESS</h2><span class="online"><i class="dot teal-dot"></i> ${status}</span></div>
      <p class="identity-copy">Publish your public shielded keys so senders can resolve your connected wallet and deliver shielded notes to this vault. Your private keys and recovery phrase stay local and are never published.</p>
      <div class="shielded-key-list">
        <div class="shielded-key-row"><span>SPENDING KEY</span><code>${short(B[0])} · ${short(B[1])}</code><button type="button" data-copy-shielded="${escapeHtml(spendingKey)}" data-copy-label="Spending key">COPY</button></div>
        <div class="shielded-key-row"><span>VIEWING KEY</span><code>${short(V[0])} · ${short(V[1])}</code><button type="button" data-copy-shielded="${escapeHtml(viewingKey)}" data-copy-label="Viewing key">COPY</button></div>
      </div>
      <div class="transit-identity-actions">${publishAction}<button id="reveal-mnemonic" class="secondary-btn">SHOW RECOVERY PHRASE</button></div>
    </section>`;
}
