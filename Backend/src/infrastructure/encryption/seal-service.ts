/**
 * SealService — ported from sirius_v1 (Backend/src/infrastructure/seal/SealService.ts).
 * Wraps the Root Master Key (RMK) with policy-based encryption (here: AES-256-GCM).
 *
 * In production this would call the real Seal SDK / TEE oracle. For the hackathon demo,
 * we keep the v1 mock unchanged — it preserves the cryptographic shape (sealed blob,
 * policy, unseal-with-permission-check) without requiring real TEE infrastructure.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

export interface SealPolicy {
  repoId: string;             // local repo identifier (cuid in our DB)
  allowedAddresses: string[]; // EVM addresses
}

export interface SealedKey {
  sealedBlob: Buffer;
  policy: SealPolicy;
}

export class SealService {
  private readonly ivLength = 12;

  async sealKey(key: Buffer, policy: SealPolicy): Promise<SealedKey> {
    const sealingKey = this.deriveSealingKey(policy);
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv("aes-256-gcm", sealingKey, iv);
    const encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { sealedBlob: Buffer.concat([encrypted, tag, iv]), policy };
  }

  async unsealKey(
    sealedBlob: Buffer,
    policy: SealPolicy,
    callerAddress: string
  ): Promise<{ key: Buffer }> {
    if (!policy.allowedAddresses.includes(callerAddress)) {
      throw new Error(
        `Address ${callerAddress} not authorized to unseal RMK for repo ${policy.repoId}`
      );
    }
    const iv = sealedBlob.slice(-this.ivLength);
    const tag = sealedBlob.slice(-this.ivLength - 16, -this.ivLength);
    const encrypted = sealedBlob.slice(0, -this.ivLength - 16);
    const sealingKey = this.deriveSealingKey(policy);
    const decipher = createDecipheriv("aes-256-gcm", sealingKey, iv);
    decipher.setAuthTag(tag);
    return { key: Buffer.concat([decipher.update(encrypted), decipher.final()]) };
  }

  private deriveSealingKey(policy: SealPolicy): Buffer {
    const h = createHash("sha256");
    h.update(policy.repoId);
    h.update([...policy.allowedAddresses].sort().join(","));
    return h.digest();
  }
}
