# DEPLOYMENTS.md

> All on-chain deployments. **Hard submission gate** for the 0G prizes. Update immediately on any deploy.

## Networks

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| 0G testnet (Galileo) | 16601 | https://evmrpc-testnet.0g.ai | https://chainscan-galileo.0g.ai |
| Hardhat (local dev) | 31337 | http://127.0.0.1:8545 | — |
| Sepolia (for ENS) | 11155111 | any standard | https://sepolia.etherscan.io |

---

## 0G testnet deployments

### `AgentINFT`

- **Address**: _NOT YET DEPLOYED_ — see "User actions required" below.
- **Status**: contract built and tested. Ready to deploy as soon as the user funds a 0G testnet wallet and provides `ZEROG_PRIVATE_KEY` in `.env`.
- **Source**: `contracts/contracts/AgentINFT.sol`
- **Tests**: 10/10 passing locally (`cd contracts && npx hardhat test`).

#### To deploy

```bash
cd contracts
# Edit ../.env with your funded ZEROG_PRIVATE_KEY first.
npx hardhat run scripts/deploy.ts --network zerog
```

The script writes `deployments/zerog.json` with address, block, tx. Then update this file's table.

---

## Local Hardhat deployments (smoke / dev)

### `AgentINFT` (localhost)

| Field | Value |
|---|---|
| **Address** | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| **Chain ID** | 31337 |
| **Deployer** | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Hardhat account #0) |
| **Oracle** | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` (mock — Hardhat account #9) |
| **Tx hash** | `0x75ddd8882e5a6155db366ddac42bf2d1f5f43174a0228b1e2f58617d0fc7b793` |
| **Block** | 1 |
| **Deployed at** | 2026-04-28 |
| **Tests passing** | 10/10 |

This is for local end-to-end testing only. The submission requires a 0G testnet address.

---

## Sepolia ENS records

### Parent name

- **ENS name**: _NOT ACQUIRED YET_ — see "User actions required".
- **Owner address**: —
- **Resolver**: standard public resolver (`0x8FADE66B79cC9f707aB26799354482EB93a5B7dD` on Sepolia).

### Subnames issued

| Label | Full name | Owner | Token ID | First seen |
|---|---|---|---|---|
| _none yet_ | | | | |

---

## Demo iNFT instances

> Submission requires at least one minted iNFT visible on the 0G explorer. Currently using local Hardhat for development.

### Agent #1 — Aria the Research Assistant (PLANNED)

- **Token ID**: TBD on first mint
- **Contract**: see `AgentINFT` above
- **Owner**: deployer
- **ENS name**: `aria.<parent>.eth` (placeholder until parent name acquired)
- **Mint tx**: TBD
- **Commits in chain**: TBD (target ≥5 for demo)

---

## User actions required (blocks 0G prize submission)

1. **Fund a 0G testnet wallet via faucet** (https://faucet.0g.ai). Put the private key in `.env` as `ZEROG_PRIVATE_KEY`.
2. **Run** `cd contracts && npx hardhat run scripts/deploy.ts --network zerog`.
3. **Copy** `deployments/zerog.json#contractAddress` into this file's "0G testnet — AgentINFT" row, and into `.env` as `AGENT_INFT_ADDRESS`.
4. **Acquire** an ENS name on Sepolia (e.g. `siriusagents.eth` via the ENS app at https://app.ens.domains, switched to Sepolia). Put it in `.env` as `ENS_PARENT_NAME` and the owning private key as `ENS_OWNER_PRIVATE_KEY`.

Once 1-3 are done, re-run the smoke script (`Backend/scripts/smoke-test.ts`) against `--network zerog` — it'll mint Aria + 5 commits and update this file's "Demo iNFT instances" section automatically.

---

## How to update this file

When you deploy a contract:

1. Run the deploy command.
2. The deploy script writes `contracts/deployments/<network>.json`.
3. Copy address/block/tx into the relevant section above.
4. Commit with message `chore: deploy AgentINFT to <network>`.

If a contract is redeployed, mark the old entry `[SUPERSEDED on YYYY-MM-DD]` and add the new one below — never delete.
