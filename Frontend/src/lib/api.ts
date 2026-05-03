import { BACKEND_URL } from "./wagmi";

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    let msg = `${method} ${path} → ${r.status}`;
    try {
      const j = await r.json();
      if (j?.error) msg += `: ${j.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await r.json()) as T;
}

export interface AgentSummary {
  id: string;
  tokenId: string;
  ensName: string | null;
  ownerAddress: string;
  persona: string | null;
  parentTokenId: string | null;
  createdAt: string;
  commitCount: number;
}

export interface AgentDetail {
  id: string;
  tokenId: string;
  ensName: string | null;
  ownerAddress: string;
  persona: string | null;
  head: string;
  rmkSealId: string;
  parentTokenId: string;
  parentCommit: string;
  contract: string;
  commits: Array<{
    hash: string;
    parentHash: string | null;
    manifestUri: string;
    merkleRoot: string;
    message: string;
    timestamp: string;
    txHash: string | null;
  }>;
}

export interface MemoryEntryInput {
  type: "memory_chunk" | "persona_delta" | "skill";
  content: string;
  tags?: string[];
}

export interface CommitResult {
  commitHash: string;
  parent: string;
  manifestUri: string;
  merkleRoot: string;
  txHash: string;
  entryCount: number;
}

export interface ReadResult {
  commitHash: string;
  manifestUri: string;
  merkleRoot: string;
  merkleVerified: boolean;
  entries: Array<{ id: string; type: string; plaintext: string; tags: string[] }>;
}

export interface DiffResult {
  from: string;
  to: string;
  added: Array<{ id: string; type: string; toSha?: string }>;
  removed: Array<{ id: string; type: string; fromSha?: string }>;
  modified: Array<{ id: string; type: string; fromSha?: string; toSha?: string }>;
  unchanged: number;
}

export interface VerifyResult {
  ensName: string;
  resolved: { tokenId: string; head: string; merkleRoot: string } | null;
  manifestUri: string | null;
  computedMerkle: string | null;
  manifestHashLocally: string | null;
  verified: boolean;
  reason: string;
  live: boolean;
}

export interface InferResult {
  output: string;
  attestation: { provider: string; ts: number };
  memoryCount: number;
  teeSignature: string;
}

export const api = {
  health: () => http<{ ok: boolean; chainId: number; contract: string; ensLive: boolean; computeProvider: string }>("GET", "/health"),
  listAgents: () => http<{ agents: AgentSummary[] }>("GET", "/agents"),
  getAgent: (id: string) => http<AgentDetail>("GET", `/agents/${id}`),
  createAgent: (body: { owner: string; ensLabel?: string; persona?: string }) =>
    http<{ agentId: string; tokenId: string; ensName: string | null; txHash: string }>("POST", "/agents", body),
  commit: (id: string, body: { message: string; entries: MemoryEntryInput[] }) =>
    http<CommitResult>("POST", `/agents/${id}/commits`, body),
  read: (id: string, commitHash?: string) =>
    http<ReadResult>("POST", `/agents/${id}/read`, commitHash ? { commitHash } : {}),
  diff: (id: string, from: string, to: string) =>
    http<DiffResult>("GET", `/agents/${id}/diff?from=${from}&to=${to}`),
  fork: (id: string, body: { atCommit: string; newOwner: string }) =>
    http<{ childAgentId: string; childTokenId: string; txHash: string }>("POST", `/agents/${id}/fork`, body),
  infer: (id: string, body: { prompt: string; contextLimit?: number }) =>
    http<InferResult>("POST", `/agents/${id}/infer`, body),
  verifyEns: (name: string) =>
    http<VerifyResult>("GET", `/ens/verify/${encodeURIComponent(name)}`),
  resolveEns: (name: string) =>
    http<{ ensName: string; tokenId: string; head: string; merkleRoot: string; live: boolean }>(
      "GET",
      `/ens/resolve/${encodeURIComponent(name)}`
    ),
  lineage: (id: string) =>
    http<{ tokenId: string; ancestors: string[] }>("GET", `/agents/${id}/lineage`)
};
