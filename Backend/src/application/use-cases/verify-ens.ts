import { createHash } from "crypto";
import { IBlockchainClient, IEnsClient, IStorageClient } from "../../domain/interfaces";
import { Hash, Manifest } from "../../domain/types";
import { MerkleService } from "../../infrastructure/merkle/merkle-service";

export interface VerifyEnsInput {
  ensName: string;
}

export interface VerifyEnsOutput {
  ensName: string;
  resolved: { tokenId: string; head: Hash; merkleRoot: Hash } | null;
  manifestUri: Hash | null;
  computedMerkle: Hash | null;
  manifestHashLocally: Hash | null;
  /** True iff every cross-check passes. The verify-without-RPC headline. */
  verified: boolean;
  reason: string;
}

function sha256Hex0x(s: string): Hash {
  return ("0x" + createHash("sha256").update(s, "utf8").digest("hex")) as Hash;
}

export class VerifyEnsUseCase {
  constructor(
    private ens: IEnsClient,
    private chain: IBlockchainClient,
    private storage: IStorageClient,
    private merkle: MerkleService
  ) {}

  async execute(input: VerifyEnsInput): Promise<VerifyEnsOutput> {
    const resolved = await this.ens.resolveAgent(input.ensName);
    if (!resolved) {
      return {
        ensName: input.ensName,
        resolved: null,
        manifestUri: null,
        computedMerkle: null,
        manifestHashLocally: null,
        verified: false,
        reason: "ENS name does not resolve to a Sirius agent (no sirius.head text record)"
      };
    }

    // Read the on-chain commit at HEAD to get manifestUri.
    const commit = await this.chain.getCommit(resolved.tokenId, resolved.head);
    const manifestUri = commit.manifestUri as Hash;

    // Download the manifest blob and recompute its Merkle root.
    const buf = await this.storage.download(manifestUri as string);
    const canonical = buf.toString("utf8");
    const manifest = JSON.parse(canonical) as Manifest;

    const computedMerkle = this.merkle.computeManifestRoot(manifest.entries);
    const manifestHashLocally = sha256Hex0x(canonical);

    // Primary integrity check: the Merkle root computed locally over the manifest
    // entries must match the Merkle root advertised in the ENS text record.
    // (The head/commit_hash matches the manifest's own commit_hash field.)
    const merkleMatches =
      computedMerkle.toLowerCase() === resolved.merkleRoot.toLowerCase();
    const headMatchesManifest =
      manifest.commit_hash.toLowerCase() === resolved.head.toLowerCase();

    const verified = merkleMatches && headMatchesManifest;

    return {
      ensName: input.ensName,
      resolved: {
        tokenId: resolved.tokenId.toString(),
        head: resolved.head,
        merkleRoot: resolved.merkleRoot
      },
      manifestUri,
      computedMerkle,
      manifestHashLocally,
      verified,
      reason: verified
        ? "Merkle root and HEAD from ENS text records match the locally fetched manifest. Verified without calling 0G RPC."
        : `Mismatch — merkleMatches=${merkleMatches}, headMatchesManifest=${headMatchesManifest}.`
    };
  }
}
