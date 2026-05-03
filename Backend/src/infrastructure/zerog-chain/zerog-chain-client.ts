import {
  Address as ViemAddress,
  Chain,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  PublicClient,
  WalletClient
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { IBlockchainClient } from "../../domain/interfaces";
import { Address, CommitData, Hash, OnChainCommit, Repository } from "../../domain/types";
import { AGENT_INFT_ABI } from "./agent-inft-abi";

export interface ChainConfig {
  rpcUrl: string;
  chainId: number;
  privateKey: `0x${string}`;
  contractAddress: Address;
  /** Used as a friendly chain.name in viem; cosmetic only. */
  name?: string;
}

function buildChain(cfg: ChainConfig): Chain {
  return defineChain({
    id: cfg.chainId,
    name: cfg.name ?? `chain-${cfg.chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } }
  });
}

export class ZeroGChainClient implements IBlockchainClient {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly contract: Address;
  private readonly account: ReturnType<typeof privateKeyToAccount>;

  constructor(private readonly cfg: ChainConfig) {
    const chain = buildChain(cfg);
    this.account = privateKeyToAccount(cfg.privateKey);
    this.publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
    this.walletClient = createWalletClient({
      chain,
      transport: http(cfg.rpcUrl),
      account: this.account
    });
    this.contract = cfg.contractAddress;
  }

  get signerAddress(): Address {
    return this.account.address as Address;
  }

  async mintAgent(to: Address, rmkSealId: Hash): Promise<{ tokenId: bigint; txHash: Hash }> {
    const { request } = await this.publicClient.simulateContract({
      address: this.contract,
      abi: AGENT_INFT_ABI,
      functionName: "mintAgent",
      args: [to as ViemAddress, rmkSealId],
      account: this.account
    });
    const txHash = (await this.walletClient.writeContract(request)) as Hash;
    const rcpt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    let tokenId = 0n;
    for (const log of rcpt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AGENT_INFT_ABI,
          data: log.data,
          topics: log.topics
        });
        if (decoded.eventName === "AgentMinted") {
          tokenId = decoded.args.tokenId as bigint;
          break;
        }
      } catch {
        // not an AgentINFT event; ignore
      }
    }
    if (tokenId === 0n) throw new Error("mintAgent: AgentMinted event not found in receipt");
    return { tokenId, txHash };
  }

  async commit(tokenId: bigint, c: CommitData): Promise<{ txHash: Hash }> {
    const { request } = await this.publicClient.simulateContract({
      address: this.contract,
      abi: AGENT_INFT_ABI,
      functionName: "commit",
      args: [tokenId, c.commitHash, c.parent, c.manifestUri, c.merkleRoot, c.message],
      account: this.account
    });
    const txHash = (await this.walletClient.writeContract(request)) as Hash;
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async fork(
    parentTokenId: bigint,
    atCommit: Hash,
    newRmkSealId: Hash,
    to: Address
  ): Promise<{ tokenId: bigint; txHash: Hash }> {
    const { request } = await this.publicClient.simulateContract({
      address: this.contract,
      abi: AGENT_INFT_ABI,
      functionName: "forkAgent",
      args: [parentTokenId, atCommit, newRmkSealId, to as ViemAddress],
      account: this.account
    });
    const txHash = (await this.walletClient.writeContract(request)) as Hash;
    const rcpt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    let tokenId = 0n;
    for (const log of rcpt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: AGENT_INFT_ABI,
          data: log.data,
          topics: log.topics
        });
        if (decoded.eventName === "AgentForked") {
          tokenId = decoded.args.childTokenId as bigint;
          break;
        }
      } catch {
        // skip
      }
    }
    if (tokenId === 0n) throw new Error("fork: AgentForked event not found");
    return { tokenId, txHash };
  }

  async attestReseal(
    tokenId: bigint,
    newSealId: Hash,
    oracleSig: `0x${string}`
  ): Promise<{ txHash: Hash }> {
    const { request } = await this.publicClient.simulateContract({
      address: this.contract,
      abi: AGENT_INFT_ABI,
      functionName: "attestReseal",
      args: [tokenId, newSealId, oracleSig],
      account: this.account
    });
    const txHash = (await this.walletClient.writeContract(request)) as Hash;
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  async getRepository(tokenId: bigint): Promise<Repository> {
    const r = (await this.publicClient.readContract({
      address: this.contract,
      abi: AGENT_INFT_ABI,
      functionName: "repositories",
      args: [tokenId]
    })) as readonly [Hash, Hash, bigint, bigint, Hash];
    return {
      head: r[0],
      rmkSealId: r[1],
      createdAt: r[2],
      parentTokenId: r[3],
      parentCommit: r[4]
    };
  }

  async getCommit(tokenId: bigint, hash: Hash): Promise<OnChainCommit> {
    const r = (await this.publicClient.readContract({
      address: this.contract,
      abi: AGENT_INFT_ABI,
      functionName: "getCommit",
      args: [tokenId, hash]
    })) as {
      parent: Hash;
      manifestUri: Hash;
      merkleRoot: Hash;
      author: Address;
      timestamp: bigint;
      message: string;
    };
    return r;
  }

  async getLineage(tokenId: bigint): Promise<bigint[]> {
    const r = (await this.publicClient.readContract({
      address: this.contract,
      abi: AGENT_INFT_ABI,
      functionName: "getLineage",
      args: [tokenId]
    })) as bigint[];
    return [...r];
  }

  async ownerOf(tokenId: bigint): Promise<Address> {
    const r = (await this.publicClient.readContract({
      address: this.contract,
      abi: AGENT_INFT_ABI,
      functionName: "ownerOf",
      args: [tokenId]
    })) as Address;
    return r;
  }
}
