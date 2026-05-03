# Sirius for Agents — Project Specification

> **Document purpose**: This is a complete technical specification meant to be given to Claude Code (or any AI coding assistant) as the source of truth for building the project. It contains: context, architecture, data models, contract specs, API specs, port mapping from existing code, build phases, and submission requirements.
>
> **Existing codebase**: The team has an existing Sirius Data Layer codebase built on Sui Move + Walrus (https://hackathon-walrus-ara.vercel.app). This project ports and extends that codebase to the 0G ecosystem with iNFT wrapping and ENS identity layer.

---

## 1. Project context

### 1.1 What is Sirius for Agents

Sirius for Agents is **versioned, encrypted, verifiable memory + identity infrastructure for AI agents on 0G**. The pitch in one sentence: *git for AI agents — every agent gets a complete, auditable, time-travelable history of its memory and learnings, can be minted as an iNFT, forked, and discovered via ENS.*

The existing Sirius v1 already implements the cryptographic core: encrypted file storage, on-chain commit chains with Merkle roots, anti-fork enforcement, key sealing, and TEE-style content verification. This project ports that to 0G's EVM-compatible chain, adds an ERC-7857 iNFT wrapper, integrates with the OpenClaw agent framework, and uses ENS for agent identity and version tagging.

### 1.2 Hackathon context

- **Event**: ETHGlobal Open Agents (async hackathon)
- **Dates**: April 24 – May 6, 2026
- **Submission deadline**: May 6, 2026
- **Tracks targeted** (3 partner prizes):
  1. **0G Labs — Best Agent Framework, Tooling & Core Extensions** ($7,500 max) — for the OpenClaw memory plugin / SDK
  2. **0G Labs — Best Autonomous Agents, Swarms & iNFT Innovations** ($1,500 flat) — for the live demo agent minted as iNFT
  3. **ENS — Most Creative Use** ($1,250 max) — for ENS subnames as version tags + Merkle root in text records
- **Bonus**: KeeperHub feedback bounty ($250) if time allows

### 1.3 Team

Two developers (Ali, Rayan). Mixed responsibilities — the spec below assigns work but flexibility is expected.

---

## 2. High-level architecture

### 2.1 Stack overview

| Layer | Technology | Purpose |
|---|---|---|
| Smart contracts | Solidity (0.8.x) on 0G Chain | Repository, Commit chain, ERC-7857 iNFT |
| Decentralized storage | 0G Storage SDK | Encrypted ciphertexts, sealed keys, manifests |
| AI inference | 0G Compute Sealed Inference | TEE-backed agent inference (qwen3.6-plus or GLM-5-FP8) |
| Identity layer | ENS (mainnet or testnet) | Agent names, version tags, Merkle root publishing |
| Backend | Express + TypeScript + Prisma + SQLite | Orchestration, encryption, manifest building |
| Frontend | React + Vite + TypeScript + wagmi + RainbowKit | UI |
| Agent framework | OpenClaw + custom plugin | Demo agent that uses Sirius for memory |
| Optional | KeeperHub MCP | Reliable on-chain execution + feedback bounty |

### 2.2 Conceptual mapping (Sirius v1 → Sirius for Agents)

| Concept v1 | Concept v2 |
|---|---|
| Repository (dataset versioning) | Agent (model + memory + persona) |
| Commit (dataset version) | Snapshot of agent state after learning |
| Manifest (file list + metadata) | Memory manifest (knowledge entries + persona delta) |
| File payload (encrypted blob) | Memory chunk (encrypted vector entry, conversation log, learned skill) |
| Repository owner | Agent owner (NFT holder) |
| Anti-fork (linear chain) | Linear evolution per agent — forks happen at NFT level via `forkAgent` |
| Merkle root in commit | Identical, used for tamper detection |

### 2.3 What's new in v2

- **ERC-7857 iNFT wrapper** on top of Repository — every agent is an NFT that carries its full versioned history.
- **OpenClaw plugin** that exposes `memory.commit()`, `memory.read(version)`, `memory.diff(v1, v2)` to any OpenClaw agent.
- **0G Compute Sealed Inference** integration so agent inference happens in a TEE — memory chunks are decrypted only inside the enclave.
- **ENS identity layer** — every agent can claim `<name>.sirius.eth`, with text records pointing to current HEAD and Merkle root.
- **Agent forking** — buying or forking an iNFT inherits commit history up to the fork point, then diverges.
- **Diff endpoint** — given two commits of the same agent, return a structured diff of what the agent learned.

---

## 3. Data model

### 3.1 On-chain entities

#### `Repository` (logical, not a separate contract — fields live on the iNFT)

```
struct Repository {
    address owner;            // current NFT holder
    bytes32 head;             // latest commit hash
    bytes32 rmk_seal_id;      // pointer to sealed Root Master Key on 0G Storage
    uint64  created_at;       // block timestamp
    uint256 parent_token_id;  // 0 if not a fork, else the parent iNFT tokenId
    bytes32 parent_commit;    // 0x0 if not a fork, else commit hash where fork happened
}
```

#### `Commit`

```
struct Commit {
    bytes32 hash;             // SHA-256 of the manifest JSON
    bytes32 parent;           // previous commit hash (0x0 for genesis)
    bytes32 manifest_uri;     // 0G Storage blob ID containing manifest JSON
    bytes32 merkle_root;      // SHA-256 of canonicalized manifest entries
    address author;           // who committed (must be repo owner at time of commit)
    uint64  timestamp;
    string  message;          // commit message ("learned about X", "trained on Y")
}
```

Anti-fork invariant: when calling `commit(repoId, newCommit)`, the contract MUST require `newCommit.parent == repo.head`. Concurrent commits race; only the first wins, the second reverts.

### 3.2 Off-chain entities (in 0G Storage)

#### Manifest JSON (per commit)

```json
{
  "version": 1,
  "agent_id": "0x...",
  "commit_hash": "0x...",
  "parent": "0x...",
  "timestamp": 1714521600,
  "entries": [
    {
      "type": "memory_chunk",
      "id": "mem_abc123",
      "ciphertext_blob_id": "0g://...",
      "sealed_key_blob_id": "0g://...",
      "encryption": "XChaCha20-Poly1305",
      "size_bytes": 4521,
      "tags": ["preference", "user-style"],
      "sha256": "0x..."
    },
    {
      "type": "persona_delta",
      "id": "delta_xyz789",
      "ciphertext_blob_id": "0g://...",
      "sealed_key_blob_id": "0g://...",
      "sha256": "0x..."
    }
  ],
  "metadata": {
    "model": "qwen3.6-plus",
    "openclaw_version": "v2026415",
    "session_count": 17
  }
}
```

The `merkle_root` field of the on-chain `Commit` is `sha256(JSON.stringify(canonicalize(manifest)))`. Canonicalization: sort entries by `id`, sort all object keys alphabetically, no whitespace.

#### Encryption scheme (unchanged from v1)

- Per-repository **Root Master Key (RMK)** — 256 bits, generated client-side at repo creation, sealed and uploaded.
- Per-entry **File Key (FK)** — 256 bits, used to encrypt the entry payload with XChaCha20-Poly1305.
- Each FK is sealed with the RMK using policy-based encryption.
- Only addresses authorized in the on-chain Repository (owner + delegated readers) can unseal the RMK.

### 3.3 ENS records

For an agent at `<name>.sirius.eth`:

| Text record key | Value | Purpose |
|---|---|---|
| `sirius.repo` | `eip155:<chainId>:<contractAddr>:<tokenId>` | Points to the iNFT |
| `sirius.head` | `0x<commit_hash>` | Current HEAD commit |
| `sirius.merkle` | `0x<merkle_root>` | Merkle root of HEAD's manifest |
| `sirius.version` | semver string e.g. `1.7.0` | Optional human-readable version |
| `description` | "Sirius agent: <persona summary>" | Standard ENS description |
| `avatar` | URI | Optional avatar |

For **frozen version subnames** like `v17.<name>.sirius.eth`:

| Text record key | Value |
|---|---|
| `sirius.repo` | Same as parent |
| `sirius.commit` | `0x<commit_hash>` (frozen, never changes) |
| `sirius.merkle` | `0x<merkle_root>` of that specific commit |

### 3.4 Database schema (backend, SQLite via Prisma)

```prisma
model Agent {
  id              String   @id @default(cuid())
  tokenId         String   @unique
  contractAddress String
  ensName         String?  @unique
  ownerAddress    String
  rmkSealId       String
  parentTokenId   String?
  parentCommit    String?
  createdAt       DateTime @default(now())
  commits         Commit[]
}

model Commit {
  id           String   @id @default(cuid())
  agentId      String
  hash         String   @unique
  parentHash   String?
  manifestUri  String
  merkleRoot   String
  message      String
  authorAddr   String
  timestamp    DateTime
  agent        Agent    @relation(fields: [agentId], references: [id])
  entries      Entry[]
}

model Entry {
  id              String  @id @default(cuid())
  commitId        String
  entryId         String  // mem_abc123
  type            String  // memory_chunk | persona_delta | skill
  ciphertextBlobId String
  sealedKeyBlobId String
  sha256          String
  sizeBytes       Int
  tags            String  // JSON array
  commit          Commit  @relation(fields: [commitId], references: [id])
}
```

The DB is a **read-through cache** of on-chain state — never the source of truth. Always reconcile against the chain on important reads.

---

## 4. Smart contracts

### 4.1 Contracts list

1. `AgentINFT.sol` — ERC-721 + ERC-7857 hybrid, holds Repository struct and Commit chain.
2. `CommitChain.sol` (library) — pure functions for commit hash derivation and chain traversal.
3. `ForkRegistry.sol` (optional, can live inside AgentINFT) — tracks lineage parent → children.
4. `RoyaltyDistributor.sol` (optional, EIP-2981 + on-usage hook) — splits royalties on transfer and on inference calls.

### 4.2 `AgentINFT.sol` interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AgentINFT is ERC721 {
    struct Repository {
        bytes32 head;
        bytes32 rmkSealId;
        uint64  createdAt;
        uint256 parentTokenId;
        bytes32 parentCommit;
    }

    struct Commit {
        bytes32 parent;
        bytes32 manifestUri;
        bytes32 merkleRoot;
        address author;
        uint64  timestamp;
        string  message;
    }

    // tokenId => Repository
    mapping(uint256 => Repository) public repositories;
    // tokenId => commitHash => Commit
    mapping(uint256 => mapping(bytes32 => Commit)) public commits;

    event AgentMinted(uint256 indexed tokenId, address indexed owner, bytes32 rmkSealId);
    event CommitAdded(uint256 indexed tokenId, bytes32 indexed commitHash, bytes32 parent, bytes32 merkleRoot, string message);
    event AgentForked(uint256 indexed parentTokenId, uint256 indexed childTokenId, bytes32 atCommit);
    event MetadataResealed(uint256 indexed tokenId, address indexed newOwner, bytes32 newSealId);

    function mintAgent(address to, bytes32 rmkSealId) external returns (uint256 tokenId);

    function commit(
        uint256 tokenId,
        bytes32 commitHash,
        bytes32 parent,
        bytes32 manifestUri,
        bytes32 merkleRoot,
        string calldata message
    ) external;

    function forkAgent(
        uint256 parentTokenId,
        bytes32 atCommit,
        bytes32 newRmkSealId,
        address to
    ) external returns (uint256 childTokenId);

    // ERC-7857: called by the TEE oracle on transfer to re-encrypt metadata for new owner
    function attestReseal(uint256 tokenId, bytes32 newSealId, bytes calldata oracleSig) external;

    // Helpers
    function getHead(uint256 tokenId) external view returns (bytes32);
    function getCommit(uint256 tokenId, bytes32 commitHash) external view returns (Commit memory);
    function getLineage(uint256 tokenId) external view returns (uint256[] memory ancestors);
}
```

### 4.3 Critical contract logic

**`mintAgent`**: caller provides the seal ID (already uploaded to 0G Storage). Contract creates a fresh Repository with `head = 0x0`, `parentTokenId = 0`. Mints the NFT to `to`.

**`commit`**: contract enforces `repositories[tokenId].head == parent` (anti-fork). Updates `head` to the new commit hash. Emits event. Only callable by current owner of `tokenId`.

**`forkAgent`**: contract verifies `commits[parentTokenId][atCommit]` exists, mints a new tokenId, sets `parentTokenId` and `parentCommit`. The child's `head` starts at `atCommit` (inheriting all history up to that point logically — physical commits don't get duplicated, the lineage is traversed via `parentTokenId`).

**`attestReseal`**: when an iNFT is sold, the TEE oracle decrypts the RMK with the seller's key, re-encrypts it for the buyer, uploads the new sealed blob, and calls this function with a signature. Contract verifies the oracle's signature (oracle pubkey is hardcoded or governed) and updates `repositories[tokenId].rmkSealId`. This is the ERC-7857 secure transfer mechanism.

### 4.4 Lineage traversal

`getLineage(tokenId)` walks `parentTokenId` recursively until 0, returning the chain of ancestors. Frontend uses this to render fork trees. Cap recursion at 32 to prevent gas issues — the assumption is fork chains stay shallow.

### 4.5 Gas notes

- Commits store fixed-size data only (3 bytes32 + uint64 + address + small string). Manifest details live off-chain.
- Aim for `commit()` < 100k gas. If `string message` blows the budget, switch to `bytes32 messageHash` and store the string off-chain.
- Use OpenZeppelin's ERC721 unchanged — don't reimplement.

---

## 5. Backend (Express + TypeScript)

### 5.1 Architecture pattern

Keep the v1 clean architecture:

```
Backend/src/
├── api/                    # Express routes (HTTP layer)
├── application/            # Use cases (orchestrate domain + infrastructure)
├── domain/                 # Domain models + interfaces (no dependencies)
└── infrastructure/         # Concrete implementations
    ├── zerog-chain/        # Was: sui/
    ├── zerog-storage/      # Was: walrus/
    ├── zerog-compute/      # NEW: sealed inference client
    ├── ens/                # NEW: ENS resolver
    ├── encryption/         # UNCHANGED from v1
    ├── manifest/           # UNCHANGED from v1
    └── merkle/             # UNCHANGED from v1
```

The encryption, manifest, and Merkle modules are **pure crypto** — they should not change at all from v1. The infrastructure swap is what's new.

### 5.2 Critical interfaces (in `domain/`)

```typescript
export interface IBlockchainClient {
  mintAgent(to: Address, rmkSealId: BlobId): Promise<{ tokenId: bigint; txHash: string }>;
  commit(tokenId: bigint, commit: CommitData): Promise<{ txHash: string }>;
  fork(parentTokenId: bigint, atCommit: Hash, newRmkSealId: BlobId, to: Address): Promise<{ tokenId: bigint }>;
  getRepository(tokenId: bigint): Promise<Repository>;
  getCommit(tokenId: bigint, hash: Hash): Promise<Commit>;
  getLineage(tokenId: bigint): Promise<bigint[]>;
}

export interface IStorageClient {
  upload(data: Buffer, namespace?: 'log' | 'kv'): Promise<BlobId>;
  download(blobId: BlobId): Promise<Buffer>;
  // KV namespace for fast-changing state, Log for append-only
}

export interface IComputeClient {
  sealedInference(req: {
    model: 'qwen3.6-plus' | 'GLM-5-FP8';
    prompt: string;
    encryptedMemoryBlobIds: BlobId[];
    sealedRmkId: BlobId;
  }): Promise<{
    output: string;
    teeSignature: string;
    attestation: TEEAttestation;
  }>;
}

export interface IEnsClient {
  resolveAgent(ensName: string): Promise<{ tokenId: bigint; head: Hash; merkleRoot: Hash } | null>;
  setAgentRecords(ensName: string, records: AgentENSRecords): Promise<{ txHash: string }>;
  createSubname(parent: string, label: string, owner: Address): Promise<string>;
}
```

### 5.3 Key use cases (in `application/`)

```
CreateAgentUseCase
  - Generate RMK client-side (or in backend with secure RNG)
  - Seal RMK with policy (owner + future delegates)
  - Upload sealed RMK to 0G Storage
  - Call AgentINFT.mintAgent()
  - Optional: claim ENS subname and set initial records
  - Persist Agent record in DB

CommitMemoryUseCase
  - Input: agentId, list of memory entries (raw)
  - For each entry: generate FK, encrypt with XChaCha20, seal FK with RMK, upload ciphertext + sealed key
  - Build manifest JSON
  - Compute Merkle root (canonicalize then sha256)
  - Upload manifest to 0G Storage
  - Call AgentINFT.commit(tokenId, hash, parent, manifestUri, merkleRoot, message)
  - Update ENS text records (head, merkle) — async, non-blocking
  - Persist Commit record in DB

ReadMemoryUseCase
  - Input: agentId, optional commit hash (defaults to HEAD)
  - Fetch commit from chain
  - Download manifest
  - Verify Merkle root matches manifest
  - For each requested entry: download ciphertext + sealed key, unseal FK with RMK, decrypt
  - Return decrypted entries

DiffCommitsUseCase
  - Input: agentId, fromHash, toHash
  - Fetch both manifests
  - Compute structural diff: added entries, removed entries, modified entries (by id + sha256)
  - Optional: LLM call to summarize the diff in natural language

ForkAgentUseCase
  - Input: parentTokenId, atCommit, newOwner
  - TEE oracle decrypts parent RMK, re-encrypts under new policy for newOwner
  - Upload new sealed RMK
  - Call AgentINFT.forkAgent()
  - Persist new Agent record with parentTokenId set

InferWithSealedComputeUseCase
  - Input: agentId, prompt, list of memory blob IDs to include
  - Pass encrypted memory + sealed RMK + prompt to 0G Compute
  - Return TEE-verified output + attestation
```

### 5.4 API endpoints

```
POST   /agents                          → CreateAgent
GET    /agents/:idOrEnsName             → Get agent + current state
GET    /agents/:id/lineage              → Fork tree

POST   /agents/:id/commits              → CommitMemory
GET    /agents/:id/commits              → List commits
GET    /agents/:id/commits/:hash        → Get specific commit
GET    /agents/:id/commits/:hash/manifest → Download manifest (still encrypted at entry level)
GET    /agents/:id/diff?from=:h1&to=:h2 → Structural diff

POST   /agents/:id/read                 → Decrypt and return memory entries (auth required)
POST   /agents/:id/infer                → Sealed inference with memory context
POST   /agents/:id/fork                 → Create fork

POST   /ens/:agentId/claim              → Claim subname for agent
GET    /ens/resolve/:ensName            → Resolve agent by ENS name (public)
GET    /ens/verify/:ensName             → Cheap verify: returns merkle root from text record
```

### 5.5 Authentication

- Wallet signature auth (SIWE-style): client signs a nonce, backend verifies, issues JWT.
- All write endpoints (commit, fork, read, infer) require valid JWT with address matching the agent owner (or delegated reader for `/read`).
- Public endpoints: agent metadata, lineage, ENS resolution, manifest download (still encrypted).

---

## 6. Frontend (React + Vite)

### 6.1 Stack

- React 18 + Vite + TypeScript
- `wagmi` v2 + `viem` v2 + `@rainbow-me/rainbowkit` for wallet/chain
- `@tanstack/react-query` for data fetching
- Tailwind CSS for styling (or keep v1's CSS approach)
- `ethers` only if needed for ENS — wagmi exposes ENS hooks already

### 6.2 Pages

```
/                          → Landing — pitch + featured agents
/agents/new                → Create agent wizard
/agents/:idOrEns           → Agent profile: persona, current version, commits timeline
/agents/:id/commit         → Commit new memory (manual UI for demo)
/agents/:id/diff           → Compare two versions side-by-side
/agents/:id/fork           → Fork wizard
/agents/:id/chat           → Live demo: chat with the agent (uses sealed inference)
/explore                   → Browse all minted agents on Sirius
/verify                    → Resolve any ENS name and verify Merkle root
```

### 6.3 Critical UX pieces

- **Commits timeline**: vertical list, each commit card shows hash (truncated), message, timestamp, "view manifest" link (to 0G explorer), Merkle root. The HEAD is highlighted.
- **Diff view**: two columns. Left = older version manifest entries. Right = newer. Added entries green, removed red, modified amber. Below: AI-generated changelog (optional but high impact).
- **Fork tree**: tree visualization showing parent-child relationships across iNFTs. d3 or react-flow.
- **ENS verify page**: input ENS name, output table showing on-chain HEAD vs ENS-recorded HEAD, Merkle match status. The "verify without RPC" angle — show a checkmark if the manifest you fetched matches the Merkle root advertised in ENS.

### 6.4 Sui-to-EVM frontend swaps

| v1 (Sui) | v2 (0G EVM) |
|---|---|
| `@mysten/dapp-kit` | `wagmi` + `@rainbow-me/rainbowkit` |
| `@mysten/sui.js` | `viem` |
| `useSuiClientQuery` | `useReadContract` from wagmi |
| `useSignAndExecuteTransactionBlock` | `useWriteContract` from wagmi |
| SuiScan links | 0G explorer links (check actual URL pattern in 0G docs) |
| Sui address format | Standard EVM `0x` addresses |

---

## 7. OpenClaw plugin (`@sirius/openclaw-memory`)

### 7.1 Why this matters

The 0G framework prize explicitly asks for "modular agent brain library with easy swapping of memory layers (0G Storage KV/Log)." This plugin is the cleanest path to that prize.

### 7.2 Plugin shape

OpenClaw plugins expose tools/skills that any agent can use. The plugin should expose:

```typescript
// What an OpenClaw agent can call:
interface SiriusMemoryTools {
  // Read past memories matching a query (semantic or tag-based)
  recall(args: { query: string; tags?: string[]; limit?: number }): Promise<MemoryEntry[]>;

  // Commit new memories (called automatically at end of session, or manually)
  remember(args: { entries: MemoryEntryInput[]; message: string }): Promise<{ commitHash: string }>;

  // Read memory at a specific historical version
  recallAtVersion(args: { commitHash: string; query: string }): Promise<MemoryEntry[]>;

  // Compare what changed between two points
  diff(args: { from: string; to: string }): Promise<MemoryDiff>;

  // The agent can declare its own ENS name for self-discovery / external use
  whoami(): Promise<{ ensName: string; tokenId: string; currentVersion: string }>;
}
```

### 7.3 Configuration

The plugin reads config from environment / OpenClaw config:

```yaml
# openclaw.yaml
plugins:
  sirius-memory:
    backend_url: "https://sirius.ali-rayan.dev"
    agent_token_id: "42"
    wallet_private_key: "${SIRIUS_AGENT_KEY}"  # used to sign commits
    auto_commit: true
    auto_commit_threshold: 10  # commit every 10 new memories
```

### 7.4 Auto-commit hook

A successful demo angle: the plugin hooks into OpenClaw's session lifecycle and auto-commits accumulated memories at session end. The agent never has to think about persistence — it just learns, and the commits happen.

---

## 8. ENS integration

### 8.1 Setup

- Buy `sirius.eth` (or use a project name you already own) on ENS app.
- Configure it on Sepolia testnet for hackathon (free, fast). Note the deployment context — most hackathon projects use Sepolia ENS.
- Set up subname issuance. Easiest path: use [Namespace SDK](https://namespace.ninja/) or [ENSjs](https://github.com/ensdomains/ensjs).

### 8.2 Subname creation flow

When an agent is created with `ensName: "alice"`:

1. Call Namespace SDK `createSubname({ parent: "sirius.eth", label: "alice", owner: agentOwnerAddress })` → creates `alice.sirius.eth`.
2. Set initial text records:
   - `sirius.repo` = `eip155:0gChainId:agentInftAddr:tokenId`
   - `sirius.head` = `0x0` (genesis)
   - `sirius.merkle` = `0x0`
   - `description` = "Sirius agent"
3. After every commit, async-update `sirius.head` and `sirius.merkle`.

### 8.3 Frozen version subnames

When the user wants to pin version 17 of an agent:

1. Call `createSubname({ parent: "alice.sirius.eth", label: "v17", owner: agentOwnerAddress })`.
2. Set text records to point to the specific commit hash. These are never updated.
3. UI: "Pin this version" button on each commit card.

### 8.4 Verify-without-RPC flow

The killer ENS demo:

1. User enters `alice.sirius.eth`.
2. Frontend calls `useEnsText('sirius.head')` and `useEnsText('sirius.merkle')` — pure ENS resolution, doesn't touch 0G.
3. Frontend fetches the manifest from 0G Storage (only needs the blob ID).
4. Frontend hashes the canonicalized manifest locally → compares to `sirius.merkle` from ENS.
5. If they match → "Verified ✓" badge.
6. The point: an external agent can verify integrity without ever talking to 0G's RPC — ENS alone is enough.

---

## 9. 0G Compute Sealed Inference

### 9.1 Why use it

Sealed Inference (launched March 2026) runs inference inside a TEE. The encrypted memory chunks + sealed RMK + prompt go in. Cleartext output + cryptographic attestation come out. Even node operators can't see the memory.

This is 0G's flagship feature — using it visibly in the demo strongly differentiates the project.

### 9.2 Integration

- Use the 0G Compute SDK (check `build.0g.ai` for current package name).
- Models available: `qwen3.6-plus`, `GLM-5-FP8`. Pick one — `qwen3.6-plus` likely has stronger general capabilities.
- The flow:

```
1. User sends prompt to /agents/:id/infer
2. Backend fetches list of relevant memory blob IDs (via tag/semantic search in DB index)
3. Backend constructs sealed inference request:
   { model, prompt, encryptedMemoryBlobIds, sealedRmkId }
4. 0G Compute downloads memories, unseals RMK in TEE, decrypts memories in TEE,
   runs inference, returns output + attestation
5. Backend returns output + attestation to frontend
6. Frontend displays output with a "TEE-verified" badge linking to the attestation
```

### 9.3 Fallback

If Sealed Inference integration runs into issues, fall back to: (a) decrypt memories in backend, (b) call any LLM API (Anthropic, OpenAI). Keep this as a feature flag, not a code branch — the production path must be sealed inference.

---

## 10. Code port mapping (from Sirius v1)

### 10.1 What to KEEP unchanged

| Module | Keep as-is |
|---|---|
| `Backend/src/infrastructure/encryption/` | Keep, it's pure crypto (XChaCha20-Poly1305 / AES-256-GCM) |
| `Backend/src/infrastructure/merkle/` (or wherever Merkle lives) | Keep, pure SHA-256 |
| `Backend/src/infrastructure/manifest/` | Keep, pure JSON canonicalization |
| `Backend/src/domain/` | Keep, just maybe rename "Repository" methods/comments to "Agent" semantically |
| `tee_v0/` (Python TEE verification) | Keep as optional content moderation. Or replace with 0G Compute Sealed Inference for TEE work. |

### 10.2 What to PORT

| Module | From | To |
|---|---|---|
| `Move/sources/sirius.move` | Sui Move contract | Solidity contracts in `contracts/` directory (Foundry or Hardhat project) |
| `Backend/src/infrastructure/sui/` | `@mysten/sui.js` calls | `Backend/src/infrastructure/zerog-chain/` using `viem` |
| `Backend/src/infrastructure/walrus/` | Walrus SDK calls | `Backend/src/infrastructure/zerog-storage/` using 0G Storage SDK |
| `Frontend/src/services/` | Sui RPC calls | EVM calls via wagmi hooks |
| `Frontend/` wallet integration | `@mysten/dapp-kit` | `wagmi` + RainbowKit |

### 10.3 What to ADD (new in v2)

| New module | Purpose |
|---|---|
| `contracts/AgentINFT.sol` | ERC-7857 wrapper |
| `Backend/src/infrastructure/zerog-compute/` | Sealed inference client |
| `Backend/src/infrastructure/ens/` | ENS resolver + subname management |
| `Backend/src/application/use-cases/ForkAgentUseCase.ts` | Fork logic |
| `Backend/src/application/use-cases/DiffCommitsUseCase.ts` | Diff logic |
| `Backend/src/application/use-cases/InferWithSealedComputeUseCase.ts` | Sealed inference orchestration |
| `openclaw-plugin/` | OpenClaw memory plugin (separate npm package or sub-folder) |
| `Frontend/src/pages/Verify.tsx` | ENS-only verification page |
| `Frontend/src/pages/Diff.tsx` | Side-by-side commit diff |
| `Frontend/src/pages/Lineage.tsx` | Fork tree visualization |

---

## 11. Build phases — 12-day timeline

> **Total**: 12 days (April 24 → May 6, 2026). Daily sync 30 min in the evening to align.

### Phase 1: Foundation (Days 1–3)

**Goal**: end-to-end "create agent + commit memory" works on 0G testnet.

#### Day 1 (April 24) — Setup

Both: read 0G docs (`build.0g.ai`), claim 0G testnet faucet.

Track A (contracts):
- Init Foundry project in `contracts/`.
- Identify all logic to port from `Move/sources/sirius.move`.
- Sketch `AgentINFT.sol` skeleton.

Track B (backend/frontend):
- Read 0G Storage SDK docs.
- Inventory all Walrus call sites in `Backend/src/`.
- Inventory all `@mysten` imports in `Frontend/src/`.
- POC: upload + download a 1KB blob on 0G Storage. Confirm it works.

Sync: align on contract naming.

#### Day 2 (April 25) — Port contracts + storage

Track A (contracts):
- Implement `AgentINFT.sol` with `mintAgent`, `commit` (with anti-fork check).
- Foundry tests: mint, commit 3 in a row, attempt fork (should revert), happy path.

Track B (backend):
- Replace `infrastructure/walrus/` with `infrastructure/zerog-storage/` — keep the same interface so use cases don't change.
- Confirm encryption + manifest + merkle modules still work end-to-end with new storage.

#### Day 3 (April 26) — Wire-up + first E2E

Track A:
- Deploy `AgentINFT.sol` to 0G testnet.
- Save contract address to `DEPLOYMENTS.md` (this is a submission requirement).
- Write viem-based client in `infrastructure/zerog-chain/`.

Track B:
- Frontend: swap `@mysten/dapp-kit` for wagmi + RainbowKit. Configure for 0G chain.
- Migrate "Create repo" + "Upload file" pages.
- E2E test: create agent + 1 commit on 0G testnet from the UI.

**MILESTONE J3**: agent created, commit on-chain, manifest in 0G Storage, frontend shows the result. If not achieved, cut all extension scope.

### Phase 2: Agent layer (Days 4–6)

**Goal**: live OpenClaw agent that learns and persists. iNFT minted and visible.

#### Day 4 (April 27) — ERC-7857 + OpenClaw plugin

Track A:
- Add ERC-7857 features to `AgentINFT.sol`: `attestReseal`, `forkAgent`.
- Add `RoyaltyDistributor.sol` with EIP-2981 + on-usage hook.
- Redeploy, update `DEPLOYMENTS.md`.

Track B:
- Clone OpenClaw, study plugin architecture.
- Implement `@sirius/openclaw-memory` plugin in `openclaw-plugin/`.
- Backend endpoint: `POST /agents/:id/commits` accepting plugin format.

#### Day 5 (April 28) — Sealed Inference + demo agent

Track A:
- Integrate 0G Compute Sealed Inference in `infrastructure/zerog-compute/`.
- Implement `InferWithSealedComputeUseCase`.
- Single E2E test of sealed inference call.

Track B:
- Build the demo agent: "Research Assistant" persona.
- The agent reads docs, summarizes, learns user style preferences.
- Each session, it auto-commits new memories.
- Frontend: "Agent profile" page showing commit timeline.

#### Day 6 (April 29) — Buffer + dogfood

Both: run the demo agent through 5–10 real conversations. Verify each commit shows real deltas. Fix any rough edges.

**MILESTONE J6**: agent live, iNFT minted (visible on 0G explorer), 5+ commits in chain. If not achieved, cut iNFT track and ship just framework + ENS.

### Phase 3: Identity + diff (Days 7–9)

**Goal**: ENS layer + diff + fork — the novel features that win prizes.

#### Day 7 (April 30) — ENS resolver

Track A:
- Acquire ENS name (`sirius.eth` or similar) on Sepolia testnet.
- Set up subname issuance via Namespace SDK.
- Backend service: auto-update text records on every commit.

Track B:
- Frontend: input "ENS name" in agent creation flow.
- Frontend: `Verify.tsx` page — resolve ENS, fetch manifest, verify Merkle locally, show badge.
- This is the demo killer — must look polished.

#### Day 8 (May 1) — Diff + fork

Track A:
- Implement `forkAgent` end-to-end. Re-encryption mock (or real if TEE oracle is available).
- Test: fork an agent at commit 5, confirm new tokenId, confirm lineage.

Track B:
- Implement `DiffCommitsUseCase`: structural diff between two manifests.
- Optional: LLM call to generate natural-language changelog.
- Frontend: `Diff.tsx` side-by-side view + AI changelog panel.

#### Day 9 (May 2) — Bonus + integration tests

Track A:
- If time: integrate KeeperHub MCP for commit transactions ($250 feedback bounty).
- Otherwise: contract security pass (reentrancy, access control review).

Track B:
- E2E happy path test: create → commit × 3 → diff → fork → verify via ENS.
- Edge cases: empty agent, fork of fork, wrong owner trying to commit.
- Polish UI: loading states, error toasts, empty states.

**DECISION POINT J9**: code freeze decision. Anything not solid by tonight, cut it.

### Phase 4: Polish + ship (Days 10–12)

#### Day 10 (May 3) — Code freeze + demo prep

CODE FREEZE.

Track A:
- 3 architecture diagrams (repo/commit, iNFT flow, ENS resolution).
- Verify all contract addresses in `DEPLOYMENTS.md`.
- README technical section.

Track B:
- Write demo script (word for word, 2:30 max).
- Rehearse demo locally 3 times. Note UI hiccups.
- Set up OBS or Loom for recording.

#### Day 11 (May 4) — Video + writing

Track A:
- Final README with: pitch, architecture diagrams, setup, contract addresses, links to mint on 0G explorer, ENS name, live demo.
- Push clean commit history to public repo.

Track B:
- Record video (multiple takes, keep best). Edit minimally: 10s intro + 2:20 demo + 10s outro.
- Upload to YouTube unlisted.
- Deploy frontend to Vercel.

Evening sync: review every submission together.

#### Day 12 (May 5–6) — Submit

Submit on ETHGlobal Hacker Dashboard. **One project, three partner prizes selected.** Each prize requires its own short description tailored to that prize's criteria.

**Submit by May 6 afternoon, NOT 23:59.**

---

## 12. Submission requirements per track

### 12.1 0G — Framework prize

Required:
- [ ] GitHub public repo with README + setup instructions
- [ ] Demo video < 3 min + live demo link
- [ ] Contract addresses (in `DEPLOYMENTS.md` and README)
- [ ] At least one example agent built using the framework (the demo Research Assistant counts)
- [ ] Architecture diagram (strongly recommended)
- [ ] Team Telegram + X handles

Pitch angle: emphasize the `@sirius/openclaw-memory` plugin as a modular memory layer for OpenClaw. "0G Storage KV/Log + Sealed Inference + commit-based versioning, all in one plugin."

### 12.2 0G — Autonomous Agents / iNFT prize

Required:
- [ ] All standard items above
- [ ] Link to minted iNFT on 0G explorer
- [ ] Proof that intelligence is embedded (link to encrypted memory blobs + sealed RMK)

Pitch angle: emphasize the live agent — it learns, persists, can be forked, has royalties. Show the commit timeline. Show the fork tree.

### 12.3 ENS — Most Creative Use

Required:
- [ ] Functional demo (no hard-coded values, real ENS resolution at runtime)
- [ ] Video or live demo link

Pitch angle: emphasize subnames as version tags + Merkle root in text records enabling RPC-less verification. "We turned ENS into a git-tag-on-chain for AI agents."

### 12.4 KeeperHub feedback bounty (if time)

Required:
- [ ] Used KeeperHub (MCP or CLI) at least once
- [ ] Specific, actionable feedback (UX friction, bugs with steps, doc gaps, feature requests)

Pitch angle: write a markdown file `KEEPERHUB_FEEDBACK.md` covering at least 3 specific items. Generic praise doesn't qualify.

---

## 13. Repository structure

```
sirius-for-agents/
├── README.md                            # Pitch + architecture + setup
├── DEPLOYMENTS.md                       # Contract addresses on 0G testnet
├── KEEPERHUB_FEEDBACK.md               # Optional, for bounty
├── docs/
│   ├── architecture.md                  # Detailed architecture
│   ├── diagrams/                        # SVG/PNG architecture diagrams
│   └── pitch.md                         # The narrative
├── contracts/                           # Foundry project
│   ├── src/
│   │   ├── AgentINFT.sol
│   │   ├── CommitChain.sol
│   │   └── RoyaltyDistributor.sol
│   ├── test/
│   ├── script/                          # Deployment scripts
│   └── foundry.toml
├── Backend/                             # Express API
│   ├── src/
│   │   ├── api/                         # Express routes
│   │   ├── application/                 # Use cases
│   │   ├── domain/                      # Domain models + interfaces
│   │   ├── infrastructure/
│   │   │   ├── zerog-chain/             # NEW (was sui/)
│   │   │   ├── zerog-storage/           # NEW (was walrus/)
│   │   │   ├── zerog-compute/           # NEW
│   │   │   ├── ens/                     # NEW
│   │   │   ├── encryption/              # KEEP from v1
│   │   │   ├── manifest/                # KEEP from v1
│   │   │   └── merkle/                  # KEEP from v1
│   │   └── prisma/
│   ├── package.json
│   └── .env.example
├── Frontend/                            # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── lib/
│   │       └── wagmi.ts                 # NEW chain config
│   ├── package.json
│   └── .env.example
├── openclaw-plugin/                     # NEW
│   ├── src/
│   │   ├── index.ts
│   │   ├── tools/
│   │   └── lifecycle.ts
│   ├── package.json
│   └── README.md                        # Standalone plugin docs
└── tee_v0/                              # KEEP from v1 if useful
```

---

## 14. Environment variables

### Backend (`.env`)

```
PORT=3001
DATABASE_URL="file:./dev.db"

# 0G Chain
ZEROG_CHAIN_RPC=https://...
ZEROG_CHAIN_ID=...
ZEROG_PRIVATE_KEY=0x...                    # Backend signer for orchestration
AGENT_INFT_ADDRESS=0x...
ROYALTY_DISTRIBUTOR_ADDRESS=0x...

# 0G Storage
ZEROG_STORAGE_RPC=https://...
ZEROG_STORAGE_API_KEY=...

# 0G Compute
ZEROG_COMPUTE_ENDPOINT=https://...
ZEROG_COMPUTE_API_KEY=...
ZEROG_COMPUTE_MODEL=qwen3.6-plus

# ENS
ENS_RPC=https://...                         # Sepolia
ENS_PARENT_NAME=sirius.eth
ENS_RESOLVER_ADDRESS=0x...
ENS_OWNER_PRIVATE_KEY=0x...                 # For setting text records

# Auth
JWT_SECRET=...

# Optional: TEE content verification (legacy from v1)
ANTHROPIC_API_KEY=...

# Optional: KeeperHub for feedback bounty
KEEPERHUB_API_KEY=...
```

### Frontend (`.env`)

```
VITE_BACKEND_URL=http://localhost:3001
VITE_ZEROG_CHAIN_ID=...
VITE_ZEROG_RPC=https://...
VITE_AGENT_INFT_ADDRESS=0x...
VITE_ENS_PARENT=sirius.eth
VITE_WALLETCONNECT_PROJECT_ID=...
```

---

## 15. Key risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| 0G testnet faucet rate-limited or down | Medium | Get funded EARLY (Day 1). Have backup wallets. |
| 0G Storage SDK has rough edges | Medium | POC on Day 1 before committing. Have a fallback: IPFS/Filecoin if 0G storage doesn't work. |
| Sealed Inference too new, integration fails | High | Have a fallback path: decrypt in backend + call any LLM. Feature-flag this. |
| ENS testnet (Sepolia) different from mainnet behavior | Medium | Test all flows on Sepolia early. Document testnet quirks in README. |
| ERC-7857 oracle for resealing requires infra we don't have | High | Use a mock oracle for the demo. Hardcode a known oracle public key. The standard isn't fully production-ready in May 2026. |
| Demo video timing creep (>3 min) | Medium | Script word-for-word. Re-record if over. Cut sections, don't speed up speech. |
| Two devs collide on git | Low if daily syncs happen | Branch per feature, daily merges. Don't both touch the contracts at the same time. |
| Submission deadline rush at 23:59 | Medium | Plan to submit afternoon of May 6, not evening. |

---

## 16. The demo script (target: 2:30)

> **Used as a tool to focus dev priorities. If a feature isn't in the demo, it's not on the critical path.**

```
[0:00–0:15] Hook
"Today, when you mint an AI agent as an NFT, you mint a frozen brain.
But agents learn. They evolve. There's no version history, no rollback,
no way to fork them. We built Sirius — git for AI agents."

[0:15–0:45] Problem + setup
- Show empty agent dashboard
- Click "Create new agent"
- Name: "Aria — Research Assistant"
- ENS: aria
- Mint
- Show agent profile, commit timeline = empty

[0:45–1:30] The agent learns
- Open agent chat
- "Help me understand transformer attention"
- Agent responds (note: "TEE-verified" badge — sealed inference)
- "Remember that I prefer concise explanations with code examples"
- End session
- Show: timeline now has 2 commits. Click commit 2 → see manifest hash, Merkle root.

[1:30–2:00] The killer features
- Open Diff page
- Compare commit 1 vs commit 2 → "Aria learned: user prefers concise explanations with code"
- Open Verify page
- Type "aria.sirius.eth"
- Show: ENS resolves → Merkle root pulled from text record → manifest fetched from 0G Storage → hashes match → "Verified" badge
- "Notice we never called the 0G RPC for this verification — pure ENS"

[2:00–2:25] The fork
- Click "Fork Aria at v2"
- New agent: "Aria-Coder"
- Show: lineage tree. Aria → Aria-Coder.
- Aria-Coder is a separate iNFT, inherits Aria's history up to v2, then diverges.

[2:25–2:30] Close
"Sirius for Agents — built on 0G, integrated with OpenClaw, identified via ENS.
Live on testnet. Open source. Repo in description."
```

---

## 17. Definition of done

The project is "done" when:

- [ ] Demo script can be executed end-to-end with no manual intervention
- [ ] Repository is public on GitHub with clean commit history
- [ ] README has: pitch, architecture diagram, setup instructions, deployment addresses, ENS name, live demo URL, video link
- [ ] At least one iNFT is minted and visible on 0G explorer
- [ ] At least 3 commits exist in that iNFT's commit chain
- [ ] ENS subname resolves to the correct iNFT and shows correct HEAD/Merkle text records
- [ ] Diff endpoint returns a structured diff for two valid commits
- [ ] Fork creates a new iNFT with parent lineage on-chain
- [ ] Frontend deployed to Vercel and accessible publicly
- [ ] Demo video uploaded to YouTube (unlisted, link in README)
- [ ] Three partner prize submissions completed on ETHGlobal Hacker Dashboard, each with a tailored description
- [ ] (Optional) `KEEPERHUB_FEEDBACK.md` written if the integration was attempted

---

## 18. Glossary

- **0G**: decentralized AI operating system + EVM L1 + storage + DA + compute
- **Aristotle Mainnet**: 0G's mainnet, live since Sep 2025
- **AXL**: Gensyn's P2P agent communication layer (not used in this project, named here in case it becomes relevant)
- **dAIOS**: decentralized AI Operating System (0G's positioning)
- **ENSIP-25**: ENS standard for linking ENS names to on-chain agent registries
- **ERC-7857**: 0G's NFT standard for AI agents with encrypted intelligence (iNFTs)
- **iNFT**: Intelligent NFT, an ERC-7857 token
- **MCP**: Model Context Protocol (Anthropic), agent-to-tool standard
- **Merkle root**: SHA-256 hash of canonicalized manifest, stored in commit
- **OpenClaw**: most popular open-source AI agent framework in 2026 (~347K GitHub stars)
- **Resealing**: re-encrypting metadata under a new owner's key during NFT transfer (ERC-7857 mechanism)
- **RMK**: Root Master Key, per-repo key used to seal individual file keys
- **Sealed Inference**: 0G's TEE-backed inference, launched March 2026
- **Subname**: ENS hierarchical name like `alice.sirius.eth`
- **TEE**: Trusted Execution Environment (Intel SGX, AMD SEV, etc.)
- **x402**: HTTP 402 Payment Required protocol for autonomous machine payments

---

*End of specification.*
