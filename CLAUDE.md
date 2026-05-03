# CLAUDE.md

> This file is automatically loaded by Claude Code at the start of every session in this repo. It contains project conventions, repo navigation, and the rules of engagement. **Always read `PROJECT_SPEC.md` after this file** — it is the source of truth.

## Project at a glance

This project is **Sirius for Agents** — versioned, encrypted, verifiable memory + identity infrastructure for AI agents on the 0G blockchain. We are building it for the ETHGlobal Open Agents hackathon (April 24 – May 6, 2026), targeting three partner prizes: 0G framework, 0G iNFT, and ENS most creative.

We are porting an existing codebase (Sirius v1, located in `reference/sirius-v1/`, built on Sui Move + Walrus) to the 0G ecosystem with new layers: ERC-7857 iNFT wrapping, OpenClaw plugin, ENS identity, and 0G Compute Sealed Inference.

**Read `PROJECT_SPEC.md` for the full architecture, data model, contract specs, API specs, port mapping, and 12-day build plan.** It is exhaustive and authoritative.

## Critical rules

1. **Reuse v1 cryptography unchanged.** The encryption (XChaCha20-Poly1305 / AES-256-GCM), the Merkle tree (SHA-256 over canonicalized manifest JSON), and the manifest building logic are pure crypto modules in v1. They MUST be ported over without modification. Do not reimplement them.

2. **Never edit `reference/sirius-v1/`.** It is the existing codebase, kept here for porting reference. Read it freely. Copy code from it into the new structure with attribution. Never modify it.

3. **`PROJECT_SPEC.md` is the source of truth.** If anything in this `CLAUDE.md` contradicts `PROJECT_SPEC.md`, the spec wins. If a user request contradicts the spec, ask before deviating.

4. **Always update `PROGRESS.md`** at the end of any significant work session. Capture what was done, what's blocked, what's next. This is how the human team and future Claude Code sessions stay aligned.

5. **Always update `DEPLOYMENTS.md`** the moment a contract is deployed. Address, network, deployer, deployment block, tx hash. Missing addresses break the hackathon submission.

6. **Code in English, comments in English.** The team speaks French in chat but the code stays English-only for tooling compatibility.

7. **Do not invent features.** If a capability isn't in `PROJECT_SPEC.md`, do not add it. We are time-constrained. Ask first.

## Repo structure (target)

```
.
├── CLAUDE.md                  # You are here
├── PROJECT_SPEC.md            # Source of truth — READ THIS NEXT
├── PROGRESS.md                # Living log of what's done
├── DEPLOYMENTS.md             # Contract addresses (gate for submission)
├── README.md                  # Public-facing pitch + setup
├── reference/
│   └── sirius-v1/             # Original Sui+Walrus codebase, READ-ONLY
├── contracts/                 # Foundry project for 0G Solidity contracts
├── Backend/                   # Express API server
├── Frontend/                  # React + Vite UI
├── openclaw-plugin/           # @sirius/openclaw-memory npm package
└── docs/                      # Architecture diagrams, pitch deck
```

## Code conventions

### General

- TypeScript everywhere it can be (Backend, Frontend, OpenClaw plugin).
- Solidity 0.8.24 minimum for contracts.
- Prefer pure functions in domain logic. Side effects belong in infrastructure.
- No `any` in TypeScript without an inline justification comment.
- Imports sorted: stdlib → external → internal absolute → internal relative.

### Backend

- Clean architecture: `api → application → domain ← infrastructure`. Inner layers do not import outer layers.
- Use cases live in `Backend/src/application/use-cases/` as classes implementing `execute(input): Promise<output>`.
- All blockchain / storage / compute calls go through interfaces defined in `Backend/src/domain/`. The concrete implementations live in `infrastructure/`.
- Logging: `pino` for structured logs. Never `console.log` in committed code.
- Error handling: domain errors are typed. Infrastructure errors are caught and rewrapped.

### Frontend

- React functional components only. No class components.
- One page = one file in `Frontend/src/pages/`.
- Reusable UI components in `Frontend/src/components/`.
- All wagmi hooks in custom hooks under `Frontend/src/hooks/` — pages should not import wagmi directly.
- Keep state minimal. Server state → react-query. Component state → useState. Global UI state → zustand only if truly needed.

### Contracts

- Use Foundry (`forge`, `cast`, `anvil`).
- Test coverage target: every public function has at least a happy-path test, every revert condition has a negative test.
- Use OpenZeppelin contracts unchanged where possible — do not reinvent ERC-721.
- Document gas implications of any storage write in a comment.
- Use `bytes32` over `string` whenever possible for gas.

### Naming

- Solidity: `PascalCase` for contracts, `camelCase` for functions, `_camelCase` for internal/private, `SCREAMING_SNAKE_CASE` for constants.
- TypeScript: `PascalCase` for types/classes/components, `camelCase` for functions/variables, `SCREAMING_SNAKE_CASE` for constants.
- Files: `kebab-case.ts` for modules, `PascalCase.tsx` for React components.

## Common commands

### Backend

```bash
cd Backend
npm install
npx prisma migrate dev
npm run api:dev          # start dev server on :3001
npm run typecheck        # tsc --noEmit
npm run test             # vitest
```

### Frontend

```bash
cd Frontend
npm install
npm run dev              # vite dev on :5173
npm run build            # production build
npm run typecheck
```

### Contracts

```bash
cd contracts
forge install            # install dependencies
forge build              # compile
forge test -vv           # run tests with verbose output
forge script script/Deploy.s.sol --rpc-url $ZEROG_CHAIN_RPC --private-key $ZEROG_PRIVATE_KEY --broadcast
```

### OpenClaw plugin

```bash
cd openclaw-plugin
npm install
npm run build            # tsc
npm link                 # link locally for testing
```

## Workflow per session

When the user starts a new Claude Code session, this is the expected behavior:

1. Read `CLAUDE.md` (this file).
2. Read `PROJECT_SPEC.md`.
3. Read `PROGRESS.md` to know where we left off.
4. Ask the user what they want to work on, OR if their initial prompt is specific, just go.
5. Work in small commits. Run typecheck and tests before claiming a task is done.
6. At end of session, update `PROGRESS.md` with what was done and any blockers.

## What to do when the user asks for a section of the spec

The spec is structured by section number (1–18). When the user says "implement section 4.2" or "build the use cases from section 5.3", treat that as the source of truth for that task. Do not deviate without asking.

## Known unknowns

These are open questions in the spec that will need to be answered through implementation:

- Exact 0G Storage SDK API. Check `build.0g.ai` first session.
- Exact 0G Compute Sealed Inference API. Same.
- Whether ERC-7857 oracle infrastructure is available on testnet. If not, mock with a known oracle public key for the demo.
- ENS deployment context. We will likely use Sepolia testnet, but verify in `PROJECT_SPEC.md` section 8.1.

When you hit one of these, do a web search if you have access, OR document the assumption you made and flag it to the user.

## Communication style

- Be concise. Code first, prose second.
- When you make a decision that wasn't explicitly in the spec, surface it: "I'm doing X because Y, let me know if you'd prefer Z."
- When you don't know something, say so. Don't fabricate API signatures.
- The user's English is functional but French is their first language. If they switch to French, keep responding in English (code/comments) but you can answer questions in French.

## What success looks like

A working live demo on 0G testnet by May 6, 2026, with:
- An iNFT minted and visible on the 0G explorer
- 3+ commits in its commit chain
- ENS subname resolving correctly with HEAD/Merkle text records
- Diff endpoint returning structured diffs
- Fork creating a new iNFT with on-chain lineage
- Frontend deployed publicly (Vercel)
- 2:30 demo video uploaded
- Three submission descriptions ready for ETHGlobal

If we hit all of that, we have a real shot at $10K+ in stacked prizes.
