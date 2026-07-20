export const RAGEQUIT_PATH = "/vault/ragequit";

export function ragequitAccountKey(account) {
  return account ? account.toLowerCase() : "disconnected";
}

export function partitionRagequitNotes(notes, eligibility, account) {
  const live = notes.filter((note) => note.status !== "spent");
  const accountKey = ragequitAccountKey(account);
  const eligible = [];
  const mismatched = [];

  for (const note of live) {
    const entry = eligibility[note.commitment];
    if (!entry || entry.spent) continue;
    if (account && entry.depositor.toLowerCase() === accountKey) eligible.push(note);
    else mismatched.push(note);
  }

  return { eligible, mismatched };
}

export function selectRagequitNote(ragequit, commitment) {
  const next = commitment ?? "";
  if (ragequit.noteCommitment === next) return;
  ragequit.noteCommitment = next;
  ragequit.confirmedCommitment = "";
  ragequit.proof = null;
  ragequit.response = null;
}

export function hasRagequitConsent(ragequit, commitment) {
  return Boolean(commitment) && ragequit.confirmedCommitment === commitment;
}

export function formatRagequitProof(commitmentProof) {
  const { proof, publicSignals } = commitmentProof;
  return {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    pubSignals: publicSignals.map((value) => BigInt(value)),
  };
}
