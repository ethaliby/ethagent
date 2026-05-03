import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { IBlockchainClient, IStorageClient } from "../../domain/interfaces";
import { Address, Hash } from "../../domain/types";
import { SealService } from "../../infrastructure/encryption/seal-service";

export interface ForkAgentInput {
  parentAgentId: string;
  atCommit: Hash;
  newOwner: Address;
}

export interface ForkAgentOutput {
  childAgentId: string;
  childTokenId: bigint;
  newRmkSealId: Hash;
  txHash: Hash;
}

export class ForkAgentUseCase {
  constructor(
    private prisma: PrismaClient,
    private chain: IBlockchainClient,
    private storage: IStorageClient,
    private seal: SealService
  ) {}

  async execute(input: ForkAgentInput): Promise<ForkAgentOutput> {
    const parent = await this.prisma.agent.findUnique({
      where: { id: input.parentAgentId }
    });
    if (!parent) throw new Error(`Parent agent not found: ${input.parentAgentId}`);

    // TEE-mocked re-encryption: in real ERC-7857, the TEE oracle would unseal the parent's
    // RMK with the seller's key and re-seal it under the buyer's key. Here we generate a
    // fresh RMK for the child — equivalent privacy-wise, just decoupled from parent.
    // Lineage is preserved on-chain via parentTokenId/parentCommit, so the new owner
    // inherits *attributable* history but not direct decryption rights to parent's chunks.
    const newRmk = randomBytes(32);
    const sealed = await this.seal.sealKey(newRmk, {
      repoId: "fork-tmp",
      allowedAddresses: [input.newOwner]
    });
    const sealedBlobId = await this.storage.upload(sealed.sealedBlob, "kv");
    const newRmkSealId = sealedBlobId as Hash;

    const parentTokenId = BigInt(parent.tokenId);
    const { tokenId: childTokenId, txHash } = await this.chain.fork(
      parentTokenId,
      input.atCommit,
      newRmkSealId,
      input.newOwner
    );

    const child = await this.prisma.agent.create({
      data: {
        tokenId: childTokenId.toString(),
        contractAddress: parent.contractAddress,
        ensName: null,
        ownerAddress: input.newOwner.toLowerCase(),
        rmkSealId: newRmkSealId,
        rmkB64: newRmk.toString("base64"),
        parentTokenId: parent.tokenId,
        parentCommit: input.atCommit,
        persona: parent.persona ? `${parent.persona} (forked)` : null
      }
    });

    return { childAgentId: child.id, childTokenId, newRmkSealId, txHash };
  }
}
