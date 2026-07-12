import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  WITHDRAW_L1_SIGNALS,
  WITHDRAW_L2_SIGNALS,
} from "../../src/types/withdrawal.js";

/**
 * Regression guard for the bug that bit the live run: the `withdrawL2`
 * public-signal order MUST be `[0]=nullifier, [1]=noteValue`. The L2 unit tests
 * use a mock verifier and did NOT catch a transposition, so we pin the SDK's
 * signal-index map directly against the on-chain `L2ProofLib.sol` accessors —
 * if a future circuit change moves a signal, one of these sides will disagree
 * and this test fails.
 */
const here = dirname(fileURLToPath(import.meta.url));
const L2_PROOF_LIB = resolve(
  here,
  "../../../contracts/src/contracts/lib/L2ProofLib.sol",
);

/** Extract `pubSignals[N]` returned by a named accessor in L2ProofLib.sol. */
function solidityIndexFor(source: string, accessor: string): number {
  const fn = new RegExp(
    `function\\s+${accessor}\\s*\\([^)]*\\)[^{]*\\{[^}]*pubSignals\\[(\\d+)\\]`,
  );
  const m = source.match(fn);
  if (!m) throw new Error(`accessor ${accessor} not found in L2ProofLib.sol`);
  return Number(m[1]);
}

describe("withdrawL2 public-signal order (regression: L2ProofLib parity)", () => {
  const source = readFileSync(L2_PROOF_LIB, "utf8");

  it("[0] = nullifier, [1] = noteValue in the SDK map", () => {
    expect(WITHDRAW_L2_SIGNALS.existingNullifierHash).toBe(0);
    expect(WITHDRAW_L2_SIGNALS.noteValue).toBe(1);
  });

  it("SDK map matches the on-chain L2ProofLib.sol accessor indices", () => {
    expect(WITHDRAW_L2_SIGNALS.existingNullifierHash).toBe(
      solidityIndexFor(source, "nullifierHash"),
    );
    expect(WITHDRAW_L2_SIGNALS.noteValue).toBe(
      solidityIndexFor(source, "withdrawnValue"),
    );
    expect(WITHDRAW_L2_SIGNALS.stateRoot).toBe(
      solidityIndexFor(source, "stateRoot"),
    );
    expect(WITHDRAW_L2_SIGNALS.stateTreeDepth).toBe(
      solidityIndexFor(source, "stateTreeDepth"),
    );
    expect(WITHDRAW_L2_SIGNALS.context).toBe(
      solidityIndexFor(source, "context"),
    );
  });

  it("withdrawL1 map keeps outputs first (C_dest at [1])", () => {
    expect(WITHDRAW_L1_SIGNALS.newCommitmentHashL1).toBe(0);
    expect(WITHDRAW_L1_SIGNALS.newCommitmentHashL2).toBe(1);
    expect(WITHDRAW_L1_SIGNALS.existingNullifierHash).toBe(2);
    expect(WITHDRAW_L1_SIGNALS.context).toBe(8);
  });
});
