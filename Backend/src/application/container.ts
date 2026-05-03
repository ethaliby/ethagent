import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import pino from "pino";
import { PrismaClient } from "@prisma/client";
import { Address, Hash } from "../domain/types";
import { EncryptionService } from "../infrastructure/encryption/encryption-service";
import { SealService } from "../infrastructure/encryption/seal-service";
import { MerkleService } from "../infrastructure/merkle/merkle-service";
import { ZeroGStorage } from "../infrastructure/zerog-storage/zerog-storage";
import { ZeroGChainClient } from "../infrastructure/zerog-chain/zerog-chain-client";
import { ZeroGComputeClient } from "../infrastructure/zerog-compute/zerog-compute-client";
import { EnsClient } from "../infrastructure/ens/ens-client";
import { CreateAgentUseCase } from "./use-cases/create-agent";
import { CommitMemoryUseCase } from "./use-cases/commit-memory";
import { ReadMemoryUseCase } from "./use-cases/read-memory";
import { DiffCommitsUseCase } from "./use-cases/diff-commits";
import { ForkAgentUseCase } from "./use-cases/fork-agent";
import { InferWithSealedComputeUseCase } from "./use-cases/infer-with-sealed";
import { VerifyEnsUseCase } from "./use-cases/verify-ens";
import { getPrisma } from "../infrastructure/db/prisma";

// Load .env from project root.
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

export interface AppConfig {
  port: number;
  databaseUrl: string;
  rpcUrl: string;
  chainId: number;
  privateKey: `0x${string}`;
  contractAddress: Address;
  storageRoot: string;
  storageRpc?: string;
  computeEndpoint?: string;
  computeApiKey?: string;
  computeModel?: string;
  anthropicApiKey?: string;
  ensRpc?: string;
  ensParentName?: string;
  ensResolverAddress?: Address;
  ensOwnerPrivateKey?: `0x${string}`;
}

function loadDeployedAddress(): Address | null {
  // Container.ts lives at Backend/src/application/container.ts.
  // The deploy script writes to <repo>/deployments/<network>.json.
  // We look in both that location and the alt contracts/deployments path.
  const repoRoot = path.join(__dirname, "..", "..", "..");
  const candidates = [
    path.join(repoRoot, "deployments", "zerog.json"),
    path.join(repoRoot, "deployments", "localhost.json"),
    path.join(repoRoot, "contracts", "deployments", "zerog.json"),
    path.join(repoRoot, "contracts", "deployments", "localhost.json")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8")) as { contractAddress: string };
        if (j.contractAddress) return j.contractAddress as Address;
      } catch {
        // skip
      }
    }
  }
  return null;
}

export function loadConfig(): AppConfig {
  const envContractAddr = (process.env.AGENT_INFT_ADDRESS || "").trim();
  const contractAddress =
    (envContractAddr && /^0x[0-9a-fA-F]{40}$/.test(envContractAddr)
      ? (envContractAddr as Address)
      : loadDeployedAddress()) ??
    ("0x0000000000000000000000000000000000000000" as Address);

  const rawKey = (process.env.ZEROG_PRIVATE_KEY || "").trim();
  const validKey = /^0x[0-9a-fA-F]{64}$/.test(rawKey);
  // Default to Hardhat account #0 (first signer) if no real key is provided —
  // this matches the localhost deployment so the smoke flow works out of the box.
  const HARDHAT_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const privateKey = (validKey ? rawKey : HARDHAT_PK) as `0x${string}`;

  return {
    port: Number(process.env.PORT || 3001),
    databaseUrl: process.env.DATABASE_URL || "file:./sirius.db",
    rpcUrl: process.env.ZEROG_CHAIN_RPC || "http://127.0.0.1:8545",
    chainId: Number(process.env.ZEROG_CHAIN_ID || 31337),
    privateKey,
    contractAddress,
    storageRoot: path.join(__dirname, "..", "..", "data", "blobs"),
    storageRpc: process.env.ZEROG_STORAGE_RPC,
    computeEndpoint: process.env.ZEROG_COMPUTE_ENDPOINT,
    computeApiKey: process.env.ZEROG_COMPUTE_API_KEY,
    computeModel: process.env.ZEROG_COMPUTE_MODEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    ensRpc: process.env.ENS_RPC,
    // Default to a mock parent so the ENS demo works even without acquired ENS name.
    // The EnsClient handles this transparently — UI tags it "mock" when isLive=false.
    ensParentName: process.env.ENS_PARENT_NAME || "siriusagents.eth",
    ensResolverAddress: (process.env.ENS_RESOLVER_ADDRESS || "") as Address,
    ensOwnerPrivateKey:
      /^0x[0-9a-fA-F]{64}$/.test((process.env.ENS_OWNER_PRIVATE_KEY || "").trim())
        ? (process.env.ENS_OWNER_PRIVATE_KEY!.trim() as `0x${string}`)
        : undefined
  };
}

export interface Container {
  cfg: AppConfig;
  log: pino.Logger;
  prisma: PrismaClient;
  chain: ZeroGChainClient;
  storage: ZeroGStorage;
  encryption: EncryptionService;
  seal: SealService;
  merkle: MerkleService;
  compute: ZeroGComputeClient;
  ens: EnsClient;
  createAgent: CreateAgentUseCase;
  commitMemory: CommitMemoryUseCase;
  readMemory: ReadMemoryUseCase;
  diffCommits: DiffCommitsUseCase;
  forkAgent: ForkAgentUseCase;
  infer: InferWithSealedComputeUseCase;
  verifyEns: VerifyEnsUseCase;
}

export function buildContainer(): Container {
  const cfg = loadConfig();
  const log = pino({
    transport: { target: "pino-pretty", options: { colorize: true } },
    level: process.env.LOG_LEVEL || "info"
  });
  const prisma = getPrisma();

  const chain = new ZeroGChainClient({
    rpcUrl: cfg.rpcUrl,
    chainId: cfg.chainId,
    privateKey: cfg.privateKey,
    contractAddress: cfg.contractAddress,
    name: cfg.chainId === 16601 ? "0g-galileo" : `chain-${cfg.chainId}`
  });

  const storage = new ZeroGStorage(cfg.storageRpc, cfg.storageRoot);
  const encryption = new EncryptionService();
  const seal = new SealService();
  const merkle = new MerkleService();
  const compute = new ZeroGComputeClient({
    zerogEndpoint: cfg.computeEndpoint,
    zerogApiKey: cfg.computeApiKey,
    zerogModel: cfg.computeModel,
    anthropicApiKey: cfg.anthropicApiKey,
    systemPrompt:
      "You are an AI agent with versioned, encrypted long-term memory powered by Sirius for Agents. " +
      "You learn from each session and your knowledge is anchored on chain via Merkle commitments."
  });
  const ens = new EnsClient({
    rpc: cfg.ensRpc,
    parentName: cfg.ensParentName,
    resolverAddress: cfg.ensResolverAddress,
    ownerPrivateKey: cfg.ensOwnerPrivateKey
  });

  const createAgent = new CreateAgentUseCase(
    prisma,
    chain,
    storage,
    seal,
    ens,
    cfg.ensParentName
  );
  const commitMemory = new CommitMemoryUseCase(
    prisma,
    chain,
    storage,
    encryption,
    merkle,
    ens
  );
  const readMemory = new ReadMemoryUseCase(prisma, chain, storage, encryption, merkle);
  const diffCommits = new DiffCommitsUseCase(chain, storage);
  const forkAgent = new ForkAgentUseCase(prisma, chain, storage, seal);
  const infer = new InferWithSealedComputeUseCase(prisma, compute, readMemory);
  const verifyEns = new VerifyEnsUseCase(ens, chain, storage, merkle);

  return {
    cfg,
    log,
    prisma,
    chain,
    storage,
    encryption,
    seal,
    merkle,
    compute,
    ens,
    createAgent,
    commitMemory,
    readMemory,
    diffCommits,
    forkAgent,
    infer,
    verifyEns
  };
}
