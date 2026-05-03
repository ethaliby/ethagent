import { randomBytes, createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { IBlockchainClient, IEnsClient, IStorageClient } from "../../domain/interfaces";
import { Address, Hash } from "../../domain/types";
import { SealService } from "../../infrastructure/encryption/seal-service";

export interface CreateAgentInput {
  owner: Address;
  ensLabel?: string;        // e.g. "aria" → "aria.<parent>.eth"
  persona?: string;
}

export interface CreateAgentOutput {
  agentId: string;
  tokenId: bigint;
  rmkSealId: Hash;
  ensName: string | null;
  txHash: Hash;
}

export class CreateAgentUseCase {
  constructor(
    private prisma: PrismaClient,
    private chain: IBlockchainClient,
    private storage: IStorageClient,
    private seal: SealService,
    private ens: IEnsClient,
    private ensParent?: string
  ) {}

  async execute(input: CreateAgentInput): Promise<CreateAgentOutput> {
    // 1. Generate per-repo Root Master Key.
    const rmk = randomBytes(32);

    // 2. The on-chain owner MUST be the backend signer for the demo flow:
    //    every commit() / fork() is signed by the backend, and the contract
    //    requires the signer to be the token owner. Anchoring to the user's
    //    actual wallet would require a per-action sign popup; we simulate that
    //    by minting to ourselves and recording the user's address as the
    //    "logical owner" in the local DB for display purposes.
    const chainSigner = (this.chain as unknown as { signerAddress: Address }).signerAddress;
    const onChainOwner: Address = chainSigner ?? input.owner;
    const displayOwner: Address = input.owner;

    // 3. Seal RMK under a policy that allows both the on-chain owner (server)
    //    and the user's display address.
    const tempPolicy = {
      repoId: "tmp",
      allowedAddresses: [onChainOwner, displayOwner].filter((v, i, a) => a.indexOf(v) === i)
    };
    const sealed = await this.seal.sealKey(rmk, tempPolicy);

    // 4. Upload sealed RMK to storage.
    const sealedBlobId = await this.storage.upload(sealed.sealedBlob, "kv");

    // The on-chain `rmkSealId` is bytes32. Storage blob IDs are sha256(content) hex
    // prefixed with 0x — already 32 bytes, so we use it directly.
    const rmkSealId = sealedBlobId as Hash;

    // 5. Mint on chain — to the backend signer, so it can later commit on behalf of the user.
    const { tokenId, txHash } = await this.chain.mintAgent(onChainOwner, rmkSealId);

    // 5. Persist DB row.
    const ensName = input.ensLabel && this.ensParent ? `${input.ensLabel}.${this.ensParent}` : null;
    const agent = await this.prisma.agent.create({
      data: {
        tokenId: tokenId.toString(),
        contractAddress: "filled-by-server",
        ensName: ensName ?? null,
        ownerAddress: input.owner.toLowerCase(),
        rmkSealId,
        rmkB64: rmk.toString("base64"), // dev cache only
        persona: input.persona ?? null
      }
    });

    // 6. ENS records (mock-friendly).
    if (ensName) {
      await this.ens.setAgentRecords(ensName, {
        head: ("0x" + "00".repeat(32)) as Hash,
        merkleRoot: ("0x" + "00".repeat(32)) as Hash,
        repo: `eip155:${input.owner ? 0 : 0}:0x0:${tokenId.toString()}`
      });
      // In mock mode the resolver needs to know which tokenId this ENS name points to;
      // setMockTokenId is a no-op when ENS is live (resolveAgent reads on-chain text records).
      const ensClient = this.ens as unknown as { setMockTokenId?: (n: string, t: bigint) => void };
      ensClient.setMockTokenId?.(ensName, tokenId);
    }

    return { agentId: agent.id, tokenId, rmkSealId, ensName, txHash };
  }
}
