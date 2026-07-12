import { Circomkit } from "circomkit";

async function main() {
  // create circomkit
  const circomkit = new Circomkit({
    protocol: "groth16",
    include: ["../../node_modules/circomlib/circuits", "../../node_modules/maci-circuits/circom"],
    inspect: true,
  });

  // artifacts output at `build/commitmentL1` directory
  await circomkit.compile("commitmentL1", {
    file: "commitmentL1",
    template: "CommitmentHasherL1",
    pubs: ["value", "label"],
  });

  // artifacts output at `build/commitmentL2Sender` directory
  await circomkit.compile("commitmentL2Sender", {
    file: "commitmentL2Sender",
    template: "CommitmentHasherL2Sender",
    pubs: ["value"],
  });

  // artifacts output at `build/commitmentL2Withdraw` directory
  await circomkit.compile("commitmentL2Withdraw", {
    file: "commitmentL2Withdraw",
    template: "CommitmentHasherL2Withdraw",
    pubs: ["value"],
  });

  // artifacts output at `build/withdrawL1` directory
  await circomkit.compile("withdrawL1", {
    file: "withdrawL1",
    template: "WithdrawL1",
    params: [32],
    pubs: ["withdrawnValue", "stateRoot", "stateTreeDepth", "ASPRoot", "ASPTreeDepth", "context", "bridgedValue"],
  });

  // artifacts output at `build/withdrawL2` directory
  await circomkit.compile("withdrawL2", {
    file: "withdrawL2",
    template: "WithdrawL2",
    params: [32],
    pubs: ["noteValue", "stateRoot", "stateTreeDepth", "context"],
  });

  // artifacts output at `build/merkleTree` directory
  await circomkit.compile("merkleTree", {
    file: "merkleTree",
    template: "LeanIMTInclusionProof",
    params: [32],
    pubs: ["leaf", "leafIndex", "siblings", "actualDepth"],
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
