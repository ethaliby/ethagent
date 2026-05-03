import { Address as ViemAddress, createPublicClient, createWalletClient, http, namehash, PublicClient, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { IEnsClient } from "../../domain/interfaces";
import { Address, Hash } from "../../domain/types";

/**
 * ENS client backed by Sepolia public resolver.
 *
 * If ENS_PARENT_NAME / ENS_OWNER_PRIVATE_KEY are not configured, the client runs in
 * MOCK mode: setAgentRecords stores records in memory, resolveAgent reads them back.
 * That keeps the verify-without-RPC demo functional even without a real ENS name —
 * frontend tags this as "mock" in the UI.
 *
 * When real config is present, we write text records via the ENS public resolver
 * (sirius.repo, sirius.head, sirius.merkle).
 */

const PUBLIC_RESOLVER_ABI = [
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" }
    ],
    outputs: [{ type: "string" }]
  }
] as const;

interface EnsConfig {
  rpc?: string;
  parentName?: string;
  resolverAddress?: Address;
  ownerPrivateKey?: `0x${string}`;
}

interface MockRecord {
  ensName: string;
  tokenId: bigint;
  head: Hash;
  merkleRoot: Hash;
  repo?: string;
}

export class EnsClient implements IEnsClient {
  private mock = new Map<string, MockRecord>();
  private publicClient?: PublicClient;
  private walletClient?: WalletClient;

  constructor(private readonly cfg: EnsConfig) {
    if (cfg.rpc && cfg.ownerPrivateKey && cfg.resolverAddress && cfg.parentName) {
      const account = privateKeyToAccount(cfg.ownerPrivateKey);
      this.publicClient = createPublicClient({ chain: sepolia, transport: http(cfg.rpc) });
      this.walletClient = createWalletClient({
        chain: sepolia,
        transport: http(cfg.rpc),
        account
      });
    }
  }

  get isLive(): boolean {
    return Boolean(this.publicClient && this.walletClient && this.cfg.resolverAddress);
  }

  async createSubname(parent: string, label: string, _owner: Address): Promise<string> {
    const full = `${label}.${parent}`;
    if (!this.isLive) {
      // mock — just return the constructed name
      return full;
    }
    // Subname creation typically goes through the parent's name wrapper or a registrar
    // contract specific to the deployment. The hackathon path is:
    //   - User creates subnames manually in the ENS app on Sepolia, OR
    //   - We use a wrapper-aware lib (Namespace SDK / ensjs).
    // For now we return the name and rely on the user provisioning subnames in the app.
    return full;
  }

  async setAgentRecords(
    ensName: string,
    records: { head: Hash; merkleRoot: Hash; repo?: string }
  ): Promise<{ txHash: Hash | null; mocked: boolean }> {
    if (!this.isLive) {
      const existing = this.mock.get(ensName);
      this.mock.set(ensName, {
        ensName,
        tokenId: existing?.tokenId ?? 0n,
        head: records.head,
        merkleRoot: records.merkleRoot,
        repo: records.repo ?? existing?.repo
      });
      return { txHash: null, mocked: true };
    }
    const node = namehash(ensName);
    const resolver = this.cfg.resolverAddress as ViemAddress;
    let lastTx: Hash | null = null;
    for (const [key, value] of [
      ["sirius.head", records.head],
      ["sirius.merkle", records.merkleRoot],
      ...(records.repo ? [["sirius.repo", records.repo]] : [])
    ] as [string, string][]) {
      const tx = (await this.walletClient!.writeContract({
        address: resolver,
        abi: PUBLIC_RESOLVER_ABI,
        functionName: "setText",
        args: [node, key, value],
        chain: sepolia,
        account: this.walletClient!.account!
      })) as Hash;
      await this.publicClient!.waitForTransactionReceipt({ hash: tx });
      lastTx = tx;
    }
    return { txHash: lastTx, mocked: false };
  }

  async resolveAgent(ensName: string) {
    if (!this.isLive) {
      const r = this.mock.get(ensName);
      if (!r) return null;
      return { tokenId: r.tokenId, head: r.head, merkleRoot: r.merkleRoot };
    }
    const node = namehash(ensName);
    const resolver = this.cfg.resolverAddress as ViemAddress;
    const head = (await this.publicClient!.readContract({
      address: resolver,
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "text",
      args: [node, "sirius.head"]
    })) as string;
    if (!head) return null;
    const merkleRoot = (await this.publicClient!.readContract({
      address: resolver,
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "text",
      args: [node, "sirius.merkle"]
    })) as string;
    const repo = (await this.publicClient!.readContract({
      address: resolver,
      abi: PUBLIC_RESOLVER_ABI,
      functionName: "text",
      args: [node, "sirius.repo"]
    })) as string;
    // repo is "eip155:<chainId>:<addr>:<tokenId>" — extract tokenId
    const tokenId = BigInt(repo.split(":").pop() || "0");
    return { tokenId, head: head as Hash, merkleRoot: merkleRoot as Hash };
  }

  /** Dev convenience: associate an ENS name with a tokenId in mock mode. */
  setMockTokenId(ensName: string, tokenId: bigint) {
    const r = this.mock.get(ensName);
    this.mock.set(ensName, {
      ensName,
      tokenId,
      head: r?.head ?? ("0x" + "00".repeat(32)) as Hash,
      merkleRoot: r?.merkleRoot ?? ("0x" + "00".repeat(32)) as Hash,
      repo: r?.repo
    });
  }
}
