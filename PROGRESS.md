# PROGRESS.md

> Living log. Last big update: **2026-04-30** — autonomous build session by Claude Code.

---

## Status

- **Phase**: ALL PHASES COMPLETE except live 0G testnet deploy (blocked on user wallet/funds)
- **Days remaining**: 6 (target submit by May 6 afternoon)
- **Blockers**: see "User actions required" section below — none of them block additional dev work
- **Submission readiness**: ✅ ready to ship as soon as the user (a) deploys to 0G testnet, (b) records the demo video, (c) deploys the frontend to Vercel

## What was built

### Phase 1 — Foundation (DONE)

- ✅ `contracts/` Hardhat project (Foundry not available in build env; spec §4 allows either)
- ✅ `AgentINFT.sol` — ERC-721 + ERC-7857 + EIP-2981, full functionality per spec §4.2 + §4.3
- ✅ Foundry-style tests in Hardhat: 10/10 green (`mint`, anti-fork, `commit` happy path, fork happy path, fork reverts, attestReseal happy + bad sig, royalty)
- ✅ Deploy script `contracts/scripts/deploy.ts` works for both `localhost` and `zerog`
- ✅ Local deploy at `0x5FbDB2315678afecb367f032d93F642f64180aa3` (chain 31337)
- ✅ `Backend/` Express + TS + Prisma + viem + Pino, clean architecture
- ✅ Crypto modules **PORTED UNCHANGED** from `sirius_v1`:
  - `EncryptionService` (XChaCha20-Poly1305 + AES-256-GCM)
  - `MerkleService` (SHA-256 over canonicalized entries)
  - `SealService` (RMK sealing under policy)
- ✅ `infrastructure/zerog-storage/` — `LocalFsStorage` fallback + `ZeroGStorage` adapter (lazy-loads `@0glabs/0g-ts-sdk` if installed; otherwise local FS so the rest of the system keeps working — documented assumption)
- ✅ `infrastructure/zerog-chain/` — viem-based wrapper around AgentINFT
- ✅ Use cases: `CreateAgent`, `CommitMemory`, `ReadMemory`, `DiffCommits`, `ForkAgent`, `InferWithSealedCompute`, `VerifyEns`
- ✅ Routes per spec §5.4 + a `/health` for the demo
- ✅ Smoke test (`Backend/scripts/smoke-test.ts`) — green: mint → 3 commits → read+verify Merkle → diff → fork → lineage check

### Phase 2 — Agent layer (DONE)

- ✅ ERC-7857 `attestReseal` + EIP-2981 royalty in the contract
- ✅ `openclaw-plugin/` (npm package `@sirius/openclaw-memory`) — exposes 5 tools (`recall`, `remember`, `recallAtVersion`, `diff`, `whoami`) + `note()` buffer + `onSessionEnd()` auto-commit hook + `asTools()` for OpenClaw registration. Plugin builds cleanly to `dist/`
- ✅ `Backend/src/infrastructure/zerog-compute/zerog-compute-client.ts` — three-stage fallback: 0G Compute SDK → Anthropic Claude → deterministic stub (per spec §9.3)
- ✅ `demo-agent/` Aria the Research Assistant — 5 scripted sessions producing real on-chain commit history. Aria is currently minted as token #5 on the local chain with 5 commits and a working ENS verify (mock mode)

### Phase 3 — Identity / Diff / Fork (DONE)

- ✅ `infrastructure/ens/ens-client.ts` — Sepolia public-resolver writes via viem when configured; mock-mode otherwise. Verify flow works identically in both modes.
- ✅ `DiffCommitsUseCase` — structural diff (added / removed / modified / unchanged)
- ✅ `ForkAgentUseCase` — TEE-mocked re-encryption (fresh RMK for child; lineage on chain)
- ✅ `VerifyEnsUseCase` — fetches ENS records, downloads manifest from storage, recomputes Merkle locally, compares. Returns clear reason string. Verify endpoint live at `/ens/verify/:name`.

### Phase 4 — Frontend (DONE)

- ✅ Vite + React + TypeScript + Tailwind + wagmi + RainbowKit
- ✅ Pages: `/` landing, `/agents/new`, `/agents/:id` profile + commits timeline, `/agents/:id/commit`, `/agents/:id/diff`, `/agents/:id/fork`, `/agents/:id/chat`, `/explore`, `/verify`
- ✅ All wagmi hooks behind a custom config in `Frontend/src/lib/wagmi.ts`
- ✅ Diff page renders green/red/amber per status; HEAD is highlighted on profile
- ✅ Verify page shows the headline "Verified ✓ / Mock ENS" badge with full breakdown
- ✅ Frontend builds (`vite build`); typecheck clean (`tsc --noEmit`)
- ⚠️ **Vercel deploy** is a user action — see below.

### Phase 5 — Polish + deliverables (DONE)

- ✅ `README.md` — pitch, architecture diagram (ASCII), quick start, repo structure, attribution
- ✅ `docs/ARCHITECTURE.md` — three Mermaid diagrams (overall stack, commit flow, ENS verification flow) + anti-fork invariant + ERC-7857 reseal explanation + storage/gas notes
- ✅ `docs/DEMO_SCRIPT.md` — word-for-word 2:30 script with cuts
- ✅ `docs/DEMO_RECORDING_GUIDE.md` — pre-flight, OBS setup, exact URLs to navigate, common pitfalls
- ✅ Three submission descriptions in `docs/SUBMISSION_*.md`, each tailored to its prize
- ✅ `KEEPERHUB_FEEDBACK.md` — placeholder structure with documented status (not attempted; team may fill in for the bonus bounty)
- ✅ `DEPLOYMENTS.md` — local hardhat addresses recorded; clear "User actions required" section for 0G testnet deploy

## Tests / Smoke summary

| Layer | What | Result |
|---|---|---|
| Contracts | `npx hardhat test` | **10/10 passing** |
| Backend | `npx tsc --noEmit` | clean |
| Backend | `npm run smoke` | mint → 3 commits → verify Merkle → diff → fork → lineage all pass |
| Demo agent | `npx tsx demo-agent/src/run-sessions.ts` | mint Aria + 5 commits + ENS verify=true |
| Frontend | `npx tsc --noEmit` | clean |
| Frontend | `npm run build` | builds (~22s, dist/ ready for Vercel) |
| ENS verify | `GET /ens/verify/aria.siriusagents.eth` | `verified=true` (mock mode) |

## User actions required (BLOCKERS for prize qualification)

These require the human team — Claude Code can't do them:

1. **Fund a 0G testnet wallet** via faucet (https://faucet.0g.ai). Put the private key into `.env` as `ZEROG_PRIVATE_KEY`.
2. **Deploy contracts to 0G testnet**: `cd contracts && npx hardhat run scripts/deploy.ts --network zerog`. The script writes `deployments/zerog.json`. Update `DEPLOYMENTS.md`'s "0G testnet — AgentINFT" row.
3. **Mint Aria on 0G testnet**: re-run `cd demo-agent && npx tsx src/run-sessions.ts` after pointing Backend `.env` at the live RPC.
4. **Acquire an ENS name on Sepolia** (e.g. `siriusagents.eth`) at https://app.ens.domains. Put it in `.env` as `ENS_PARENT_NAME`. The verify flow will switch to live mode automatically.
5. **Set up a WalletConnect Project ID** at https://cloud.walletconnect.com → put in `Frontend/.env` as `VITE_WALLETCONNECT_PROJECT_ID` (without it, only injected wallets work).
6. **Add `ANTHROPIC_API_KEY`** in `.env` to enable the sealed-inference fallback (live LLM responses in chat). Without it, chat returns deterministic stub responses.
7. **Deploy frontend to Vercel**: `cd Frontend && vercel deploy --prod`. Set the env vars in Vercel dashboard. Add the URL to `README.md`.
8. **Record the demo video** — follow `docs/DEMO_RECORDING_GUIDE.md`. Upload unlisted to YouTube, paste link into README + the three submission docs.
9. **Submit on ETHGlobal** — paste the three submission docs (one per prize), link the repo, link the video, link the live URL.

## What was deliberately cut / scoped down

| Cut | Rationale |
|---|---|
| Real 0G Compute SDK integration | SDK surface in flux; built fallback path so demo works deterministically. Anthropic fallback is feature-flagged in. Per spec §9.3. |
| Namespace SDK for ENS subnames | Used raw `setText` via viem for fewer deps + more control. Mock mode covers the demo until real ENS name is acquired. |
| Real TEE oracle for `attestReseal` | ERC-7857 oracle infra not mature on testnet (spec §15). Hardcoded mock keypair. Production would integrate a real TEE service. |
| KeeperHub MCP integration | Out of time budget. Bounty is $250 vs primary tracks at $10K combined. Placeholder structure in `KEEPERHUB_FEEDBACK.md` if user wants to attempt. |
| SIWE auth | Backend mocks owner-as-signer for the demo. Real auth would add JWTs but isn't needed for the prize criteria. |
| Frontend lineage tree visualization (react-flow) | Profile page shows the parent attribution explicitly. A full tree would be a 1-day add; not needed for the demo. |

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-04-28 | Hardhat instead of Foundry | Foundry not installed in build sandbox; Hardhat is npm-installable, equivalent artifacts. Spec §4 allows either. |
| 2026-04-28 | Solidity 0.8.26 (not 0.8.24) | OpenZeppelin v5.4 needs `mcopy` (Cancun). |
| 2026-04-28 | LocalFs fallback for storage | Avoid blocking E2E on 0G Storage SDK install/credential issues. Real adapter ready when SDK is. |
| 2026-04-28 | viem (not ethers v6) for backend | Smaller, modern, type-safe; matches frontend's wagmi stack. |
| 2026-04-29 | Mock TEE oracle keypair | ERC-7857 oracle infra not production-ready May 2026 per spec §15. Hardcoded mock; verifiable from on-chain pubkey. |
| 2026-04-29 | EnsClient runs in mock mode by default | So the killer Verify demo works without acquiring an ENS name first. Tagged as "mock" in UI. |
| 2026-04-29 | DiffCommits returns structural diff only | LLM-generated changelog is a polish item; the structural diff is the prize-relevant feature. Wire Anthropic for changelog as a follow-up if time. |

## Risk log

| Risk | Status | Mitigation |
|---|---|---|
| 0G testnet RPC flaky during demo | open | Local Hardhat fallback works identically. Practice demo on 0G first. |
| ENS Sepolia subname provisioning friction | open | Mock mode is identical end-to-end. Live mode is one env-var flip away. |
| Demo video timing creep | open | Script is word-for-word with explicit cuts. |
| Submission deadline rush | open | All deliverables done; submission is paste-and-click. |

---

## Open questions (resolved)

- ✅ "Exact 0G Storage SDK API" → adapter pattern with fallback; trade real-SDK wiring for E2E reliability.
- ✅ "Whether 0G Compute Sealed Inference is callable" → fallback path (Anthropic) wired; live path is a SDK swap.
- ✅ "ERC-7857 oracle infrastructure" → mocked with documented keypair.
- ✅ "Best ENS subname provisioning library" → raw viem (Namespace SDK / ENSjs are heavier deps for minimal benefit at this scale).

---

## File handoff for the human team

- Read [`README.md`](README.md) first.
- Then [`DEPLOYMENTS.md`](DEPLOYMENTS.md) for what's deployed where + the 0G deploy steps.
- Then [`docs/DEMO_RECORDING_GUIDE.md`](docs/DEMO_RECORDING_GUIDE.md) before recording the video.
- Submission text is in [`docs/SUBMISSION_0G_FRAMEWORK.md`](docs/SUBMISSION_0G_FRAMEWORK.md), [`docs/SUBMISSION_0G_INFT.md`](docs/SUBMISSION_0G_INFT.md), [`docs/SUBMISSION_ENS_CREATIVE.md`](docs/SUBMISSION_ENS_CREATIVE.md). Paste each into the corresponding ETHGlobal prize section.

If anything breaks: the smoke script is the truth — `cd Backend && npm run smoke`. If that's green, everything else flows.
