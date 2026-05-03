/**
 * EncryptionService — ported VERBATIM from sirius_v1 (Backend/src/infrastructure/crypto/EncryptionService.ts).
 * Pure crypto: XChaCha20-Poly1305 with AES-256-GCM fallback. DO NOT MODIFY.
 *
 * Adjusted only:
 *   - import path of the interface (now lives in this project's domain layer)
 *   - removed v1's domain interface dependency (we use a local shape)
 */

import { randomBytes, createHash } from "crypto";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";

export interface EncryptionResult {
  ciphertext: Buffer;
  nonce: Buffer;
  cipherSuite: "xchacha20-poly1305" | "aes-256-gcm";
}

export interface DecryptionResult {
  plaintext: Buffer;
}

export class EncryptionService {
  private readonly keyLength = 32; // 256 bits
  private readonly nonceLength = 24; // 192 bits for XChaCha20

  generateFileKey(): Buffer {
    return randomBytes(this.keyLength);
  }

  encryptFile(plaintext: Buffer, fileKey: Buffer): EncryptionResult {
    if (fileKey.length !== this.keyLength) {
      throw new Error(`File key must be ${this.keyLength} bytes (256 bits)`);
    }
    const nonce = randomBytes(this.nonceLength);
    const key = new Uint8Array(fileKey);
    const nonceUint8 = new Uint8Array(nonce);
    try {
      const cipher = xchacha20poly1305(key, nonceUint8);
      const plaintextUint8 = new Uint8Array(plaintext);
      const ciphertext = cipher.encrypt(plaintextUint8);
      return {
        ciphertext: Buffer.from(ciphertext),
        nonce: Buffer.from(nonce),
        cipherSuite: "xchacha20-poly1305"
      };
    } catch {
      return this.encryptFileAES(plaintext, fileKey);
    }
  }

  decryptFile(
    ciphertext: Buffer,
    nonce: Buffer,
    fileKey: Buffer,
    cipherSuite: string
  ): DecryptionResult {
    if (cipherSuite === "xchacha20-poly1305") return this.decryptFileXChaCha20(ciphertext, nonce, fileKey);
    if (cipherSuite === "aes-256-gcm") return this.decryptFileAES(ciphertext, nonce, fileKey);
    throw new Error(`Unsupported cipher suite: ${cipherSuite}`);
  }

  private encryptFileAES(plaintext: Buffer, fileKey: Buffer): EncryptionResult {
    const { createCipheriv } = require("crypto");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", fileKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([encrypted, tag]), nonce: iv, cipherSuite: "aes-256-gcm" };
  }

  private decryptFileXChaCha20(
    ciphertext: Buffer,
    nonce: Buffer,
    fileKey: Buffer
  ): DecryptionResult {
    if (nonce.length !== this.nonceLength) {
      throw new Error(`Nonce must be ${this.nonceLength} bytes for XChaCha20`);
    }
    const cipher = xchacha20poly1305(new Uint8Array(fileKey), new Uint8Array(nonce));
    return { plaintext: Buffer.from(cipher.decrypt(new Uint8Array(ciphertext))) };
  }

  private decryptFileAES(
    ciphertext: Buffer,
    nonce: Buffer,
    fileKey: Buffer
  ): DecryptionResult {
    const { createDecipheriv } = require("crypto");
    const tag = ciphertext.slice(-16);
    const actual = ciphertext.slice(0, -16);
    const decipher = createDecipheriv("aes-256-gcm", fileKey, nonce);
    decipher.setAuthTag(tag);
    return { plaintext: Buffer.concat([decipher.update(actual), decipher.final()]) };
  }

  deriveFileKeyFromRMK(rmk: Buffer, fileId: string): Buffer {
    const h = createHash("sha256");
    h.update(rmk);
    h.update(fileId);
    return h.digest();
  }
}
