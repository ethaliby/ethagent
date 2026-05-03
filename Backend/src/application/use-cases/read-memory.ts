import { PrismaClient } from "@prisma/client";
import { IBlockchainClient, IStorageClient } from "../../domain/interfaces";
import { Hash, Manifest } from "../../domain/types";
import { EncryptionService } from "../../infrastructure/encryption/encryption-service";
import { MerkleService } from "../../infrastructure/merkle/merkle-service";

export interface ReadMemoryInput {
  agentId: string;
  commitHash?: Hash;          // defaults to HEAD
}

export interface ReadMemoryOutput {
  commitHash: Hash;
  manifestUri: Hash;
  merkleRoot: Hash;
  merkleVerified: boolean;
  entries: Array<{
    id: string;
    type: string;
    plaintext: string;
    tags: string[];
  }>;
}

export class ReadMemoryUseCase {
  constructor(
    private prisma: PrismaClient,
    private chain: IBlockchainClient,
    private storage: IStorageClient,
    private encryption: EncryptionService,
    private merkle: MerkleService
  ) {}

  async execute(input: ReadMemoryInput): Promise<ReadMemoryOutput> {
    const agent = await this.prisma.agent.findUnique({ where: { id: input.agentId } });
    if (!agent) throw new Error(`Agent not found: ${input.agentId}`);

    const tokenId = BigInt(agent.tokenId);
    const repo = await this.chain.getRepository(tokenId);
    const head: Hash = (input.commitHash ?? repo.head) as Hash;

    if (head === ("0x" + "00".repeat(32))) {
      return {
        commitHash: head,
        manifestUri: head,
        merkleRoot: head,
        merkleVerified: true,
        entries: []
      };
    }

    const onChainCommit = await this.chain.getCommit(tokenId, head);
    const manifestBuf = await this.storage.download(onChainCommit.manifestUri as string);
    const manifest = JSON.parse(manifestBuf.toString("utf8")) as Manifest;

    const merkleVerified = this.merkle.verifyManifestRoot(manifest.entries, onChainCommit.merkleRoot);

    const rmk = Buffer.from(agent.rmkB64, "base64");
    const out: ReadMemoryOutput["entries"] = [];
    for (const e of manifest.entries) {
      const fileKey = this.encryption.deriveFileKeyFromRMK(rmk, e.id);
      const ciphertext = await this.storage.download(e.ciphertext_blob_id);
      const nonce = Buffer.from(e.nonce_b64, "base64");
      const { plaintext } = this.encryption.decryptFile(
        ciphertext,
        nonce,
        fileKey,
        e.cipher_suite
      );
      out.push({ id: e.id, type: e.type, plaintext: plaintext.toString("utf8"), tags: e.tags });
    }

    return {
      commitHash: head,
      manifestUri: onChainCommit.manifestUri as Hash,
      merkleRoot: onChainCommit.merkleRoot,
      merkleVerified,
      entries: out
    };
  }
}
