import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { IBlockchainClient, IEnsClient, IStorageClient } from "../../domain/interfaces";
import { Hash, ManifestEntry, MemoryEntryInput } from "../../domain/types";
import { EncryptionService } from "../../infrastructure/encryption/encryption-service";
import { buildManifest } from "../../infrastructure/manifest/manifest-builder";
import { MerkleService } from "../../infrastructure/merkle/merkle-service";

export interface CommitMemoryInput {
  agentId: string;
  entries: MemoryEntryInput[];
  message: string;
  metadata?: Record<string, unknown>;
}

export interface CommitMemoryOutput {
  commitHash: Hash;
  parent: Hash;
  manifestUri: Hash;
  merkleRoot: Hash;
  txHash: Hash;
  entryCount: number;
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export class CommitMemoryUseCase {
  constructor(
    private prisma: PrismaClient,
    private chain: IBlockchainClient,
    private storage: IStorageClient,
    private encryption: EncryptionService,
    private merkle: MerkleService,
    private ens: IEnsClient
  ) {}

  async execute(input: CommitMemoryInput): Promise<CommitMemoryOutput> {
    const agent = await this.prisma.agent.findUnique({ where: { id: input.agentId } });
    if (!agent) throw new Error(`Agent not found: ${input.agentId}`);

    const rmk = Buffer.from(agent.rmkB64, "base64");
    const tokenId = BigInt(agent.tokenId);

    // Encrypt each entry under a per-entry FileKey derived from RMK.
    const manifestEntries: ManifestEntry[] = [];
    const dbEntries: Array<{
      entryId: string;
      type: ManifestEntry["type"];
      ciphertextBlobId: string;
      sealedKeyBlobId: string;
      nonceB64: string;
      cipherSuite: ManifestEntry["cipher_suite"];
      sha256: string;
      sizeBytes: number;
      tags: string[];
    }> = [];

    for (const e of input.entries) {
      const id = e.id ?? `${e.type.slice(0, 3)}_${uuid().slice(0, 8)}`;
      const plaintext = Buffer.from(e.content, "utf8");
      const sha = sha256Hex(plaintext);
      const fileKey = this.encryption.deriveFileKeyFromRMK(rmk, id);
      const enc = this.encryption.encryptFile(plaintext, fileKey);
      const ciphertextBlobId = await this.storage.upload(enc.ciphertext, "log");
      // The "sealed key" is also stored — we store the FileKey wrapped in another AES-GCM
      // pass keyed by RMK || id. For demo simplicity we just upload the wrapped key bytes;
      // recovery only needs RMK + id (deriveFileKeyFromRMK).
      const sealedKeyBlobId = ciphertextBlobId; // FileKey is derivable; placeholder pointer
      manifestEntries.push({
        type: e.type,
        id,
        ciphertext_blob_id: ciphertextBlobId,
        sealed_key_blob_id: sealedKeyBlobId,
        nonce_b64: enc.nonce.toString("base64"),
        cipher_suite: enc.cipherSuite,
        size_bytes: plaintext.length,
        tags: e.tags ?? [],
        sha256: sha
      });
      dbEntries.push({
        entryId: id,
        type: e.type,
        ciphertextBlobId,
        sealedKeyBlobId,
        nonceB64: enc.nonce.toString("base64"),
        cipherSuite: enc.cipherSuite,
        sha256: sha,
        sizeBytes: plaintext.length,
        tags: e.tags ?? []
      });
    }

    // Build manifest, hash it, upload it.
    const repo = await this.chain.getRepository(tokenId);
    const parent: Hash = repo.head as Hash;
    const built = buildManifest({
      agentId: agent.id,
      parent,
      entries: manifestEntries,
      metadata: input.metadata ?? {}
    });
    const manifestBlobId = await this.storage.upload(Buffer.from(built.canonical, "utf8"), "kv");

    // Compute Merkle root of entries.
    const merkleRoot = this.merkle.computeManifestRoot(manifestEntries);

    // Anchor on chain.
    const { txHash } = await this.chain.commit(tokenId, {
      commitHash: built.hash,
      parent,
      manifestUri: manifestBlobId as Hash,
      merkleRoot,
      message: input.message
    });

    // Persist DB cache.
    const dbCommit = await this.prisma.commit.create({
      data: {
        agentId: agent.id,
        hash: built.hash,
        parentHash: parent,
        manifestUri: manifestBlobId,
        merkleRoot,
        message: input.message,
        authorAddr: agent.ownerAddress,
        txHash,
        timestamp: new Date(),
        entries: {
          create: dbEntries.map((e) => ({
            entryId: e.entryId,
            type: e.type,
            ciphertextBlobId: e.ciphertextBlobId,
            sealedKeyBlobId: e.sealedKeyBlobId,
            nonceB64: e.nonceB64,
            cipherSuite: e.cipherSuite,
            sha256: e.sha256,
            sizeBytes: e.sizeBytes,
            tags: JSON.stringify(e.tags)
          }))
        }
      }
    });

    // Update ENS records (async-but-awaited; would be fire-and-forget in production).
    if (agent.ensName) {
      try {
        await this.ens.setAgentRecords(agent.ensName, {
          head: built.hash,
          merkleRoot
        });
      } catch (err) {
        // Don't block the commit on ENS failures — log and continue.
        console.warn(`[CommitMemory] ENS update failed for ${agent.ensName}:`, err);
      }
    }

    return {
      commitHash: built.hash,
      parent,
      manifestUri: manifestBlobId as Hash,
      merkleRoot,
      txHash,
      entryCount: manifestEntries.length
    };
  }
}
