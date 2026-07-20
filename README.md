# Privacy Pool Protocol

Privacy Pool is a blockchain protocol that enables private asset transfers. Users can deposit funds publicly and partially withdraw them privately, provided they can prove membership in an approved set of addresses.

## Overview

The protocol implements a system of smart contracts and zero-knowledge proofs to enable privacy-preserving transfers while maintaining compliance through approved address sets. It supports both native assets and ERC20 token transfers.

## Repository Structure

This is a Yarn workspaces monorepo containing four packages:

```
├── packages/
│   ├── circuits/    # Zero-knowledge circuits
│   └── contracts/   # Smart contract implementations
│   └── relayer/     # Minimal relayer implementation
│   └── sdk/         # Typescript toolkit
```

See the README in each package for detailed information about their specific implementations:

- [Circuits Package](./packages/circuits/README.md)
- [Contracts Package](./packages/contracts/README.md)
- [Relayer Package](./packages/relayer/README.md)
- [SDK Package](./packages/sdk/README.md)

## Development

To set up the development environment:

```bash
# Install dependencies
yarn
```

## Emergency ragequit

Ragequit is the L1 pool's emergency exit for a depositor whose note cannot use the normal ASP-approved withdrawal path. It is not a private withdrawal: the transaction publicly links the original deposit address, the commitment, and the amount returned.

Only the EOA that originally deposited the note may call `ragequit`, and that same address must pay the L1 gas. A relayer cannot submit it because the pool checks `msg.sender` against the depositor recorded for the note's label. A successful ragequit is irreversible and burns the note's nullifier. It remains available after the pool is wound down so depositors retain an exit of last resort.
