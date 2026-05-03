/**
 * Domain types — pure data, no framework deps.
 */

export type Address = `0x${string}`;
export type Hash = `0x${string}`;
export type BlobId = string; // 0G Storage blob ID (opaque)

export type CipherSuite = "xchacha20-poly1305" | "aes-256-gcm";

export interface MemoryEntryInput {
  id?: string;                // if omitted, autogen
  type: "memory_chunk" | "persona_delta" | "skill";
  content: string;            // raw plaintext (encrypted before upload)
  tags?: string[];
}

export interface ManifestEntry {
  type: "memory_chunk" | "persona_delta" | "skill";
  id: string;
  ciphertext_blob_id: BlobId;
  sealed_key_blob_id: BlobId;
  nonce_b64: string;
  cipher_suite: CipherSuite;
  size_bytes: number;
  tags: string[];
  sha256: string;             // hex sha256 of plaintext (used in Merkle leaf)
}

export interface ManifestMetadata {
  model?: string;
  openclaw_version?: string;
  session_count?: number;
  [k: string]: unknown;
}

export interface Manifest {
  version: 1;
  agent_id: string;
  commit_hash: string;        // 0x-prefixed hex
  parent: string;             // 0x-prefixed hex (0x00…00 for genesis)
  timestamp: number;          // unix seconds
  entries: ManifestEntry[];
  metadata: ManifestMetadata;
}

export interface Repository {
  head: Hash;
  rmkSealId: Hash;            // bytes32
  createdAt: bigint;
  parentTokenId: bigint;
  parentCommit: Hash;
}

export interface OnChainCommit {
  parent: Hash;
  manifestUri: Hash;          // bytes32 — see encoding note in storage adapter
  merkleRoot: Hash;
  author: Address;
  timestamp: bigint;
  message: string;
}

export interface CommitData {
  commitHash: Hash;
  parent: Hash;
  manifestUri: Hash;
  merkleRoot: Hash;
  message: string;
}

/**
 * NOTE on bytes32 encoding for blob IDs.
 * The on-chain `manifestUri` field is `bytes32`. 0G Storage blob IDs are usually 32-byte hashes,
 * which fit cleanly into bytes32 (no truncation). If a future SDK returns a longer ID, we'd
 * extend the contract — for now, we assume 32-byte IDs and store the full off-chain ID in the
 * Manifest JSON for redundancy.
 */
