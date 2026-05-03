import { createHash } from "crypto";
import { Manifest } from "../../domain/types";

/**
 * Manifest canonicalization + hashing.
 *
 * Canonicalization rule (from PROJECT_SPEC §3.2):
 *   - sort entries by `id`
 *   - sort all object keys alphabetically
 *   - no whitespace
 *
 * The on-chain `merkleRoot` field is `sha256(JSON.stringify(canonicalize(manifest)))`.
 * The on-chain `commitHash` is the same — they happen to coincide in this scheme,
 * because the manifest already encodes parent + entries + metadata. We expose both
 * for clarity and to leave room for future schemes where they diverge.
 */

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = sortDeep(obj[k]);
    return out;
  }
  return value;
}

export function canonicalizeManifest(m: Manifest): string {
  const sorted: Manifest = {
    ...m,
    entries: [...m.entries].sort((a, b) => a.id.localeCompare(b.id))
  };
  return JSON.stringify(sortDeep(sorted));
}

export function hashCanonical(canonical: string): `0x${string}` {
  return ("0x" + createHash("sha256").update(canonical, "utf8").digest("hex")) as `0x${string}`;
}

export interface BuiltManifest {
  manifest: Manifest;
  canonical: string;
  hash: `0x${string}`;
}

export function buildManifest(input: {
  agentId: string;
  parent: `0x${string}`;
  entries: Manifest["entries"];
  metadata: Manifest["metadata"];
}): BuiltManifest {
  const ts = Math.floor(Date.now() / 1000);
  // Provisional manifest with placeholder commit_hash; we hash with a zeroed commit_hash
  // (so the hash is a function of agent_id + parent + entries + metadata only) and then
  // fill in commit_hash = hash. This makes the on-chain commitHash deterministic.
  const provisional: Manifest = {
    version: 1,
    agent_id: input.agentId,
    commit_hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    parent: input.parent,
    timestamp: ts,
    entries: input.entries,
    metadata: input.metadata
  };
  const canonicalProv = canonicalizeManifest(provisional);
  const hash = hashCanonical(canonicalProv);
  const final = { ...provisional, commit_hash: hash };
  const canonical = canonicalizeManifest(final);
  return { manifest: final, canonical, hash };
}
