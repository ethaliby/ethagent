/**
 * MerkleService — ported from sirius_v1 (Backend/src/infrastructure/crypto/MerkleService.ts).
 * SHA-256 over canonicalized manifest entries. Pure function.
 *
 * Adapted to v2's manifest entry shape (memory chunks instead of dataset blobs),
 * but the algorithm is identical: sort by id → leaf hash → pair up → recurse.
 */

import { createHash } from "crypto";
import { ManifestEntry } from "../../domain/types";

export class MerkleService {
  private hash(data: string): string {
    return createHash("sha256").update(data, "utf8").digest("hex");
  }

  private computeLeafHash(e: ManifestEntry): string {
    // Canonical leaf format: type|id|ciphertext_blob_id|sha256
    const canonical = `${e.type}|${e.id}|${e.ciphertext_blob_id}|${e.sha256}`;
    return this.hash(canonical);
  }

  private buildMerkleRoot(leaves: string[]): string {
    if (leaves.length === 0) return this.hash("");
    if (leaves.length === 1) return leaves[0];
    let level = [...leaves];
    while (level.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        if (i + 1 < level.length) next.push(this.hash(level[i] + level[i + 1]));
        else next.push(level[i]);
      }
      level = next;
    }
    return level[0];
  }

  computeManifestRoot(entries: ManifestEntry[]): `0x${string}` {
    const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
    const leaves = sorted.map((e) => this.computeLeafHash(e));
    return ("0x" + this.buildMerkleRoot(leaves)) as `0x${string}`;
  }

  verifyManifestRoot(entries: ManifestEntry[], expectedRoot: string): boolean {
    return this.computeManifestRoot(entries) === expectedRoot;
  }
}
