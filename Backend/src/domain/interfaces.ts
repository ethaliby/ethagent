import { Address, BlobId, CommitData, Hash, OnChainCommit, Repository } from "./types";

export interface IBlockchainClient {
  mintAgent(to: Address, rmkSealId: Hash): Promise<{ tokenId: bigint; txHash: Hash }>;
  commit(tokenId: bigint, c: CommitData): Promise<{ txHash: Hash }>;
  fork(
    parentTokenId: bigint,
    atCommit: Hash,
    newRmkSealId: Hash,
    to: Address
  ): Promise<{ tokenId: bigint; txHash: Hash }>;
  attestReseal(tokenId: bigint, newSealId: Hash, oracleSig: `0x${string}`): Promise<{ txHash: Hash }>;
  getRepository(tokenId: bigint): Promise<Repository>;
  getCommit(tokenId: bigint, hash: Hash): Promise<OnChainCommit>;
  getLineage(tokenId: bigint): Promise<bigint[]>;
  ownerOf(tokenId: bigint): Promise<Address>;
}

export interface IStorageClient {
  upload(data: Buffer, namespace?: "log" | "kv"): Promise<BlobId>;
  download(blobId: BlobId): Promise<Buffer>;
}

export interface IComputeClient {
  sealedInference(req: {
    model: string;
    prompt: string;
    encryptedMemoryBlobIds: BlobId[];
    sealedRmkId: BlobId;
    /** Pass plaintext memories for the fallback path (when 0G Compute unavailable). */
    plaintextMemories?: string[];
  }): Promise<{
    output: string;
    teeSignature: string;
    attestation: { provider: "0g-sealed" | "anthropic-fallback" | "stub"; ts: number };
  }>;
}

export interface IEnsClient {
  resolveAgent(
    ensName: string
  ): Promise<{ tokenId: bigint; head: Hash; merkleRoot: Hash } | null>;
  setAgentRecords(
    ensName: string,
    records: { head: Hash; merkleRoot: Hash; repo?: string }
  ): Promise<{ txHash: Hash | null; mocked: boolean }>;
  createSubname(parent: string, label: string, owner: Address): Promise<string>;
}
