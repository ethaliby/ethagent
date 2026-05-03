import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { IStorageClient } from "../../domain/interfaces";
import { BlobId } from "../../domain/types";

/**
 * LocalFsStorage — a storage adapter backed by the local filesystem.
 *
 * This is the FALLBACK path. It exists so the rest of the system (use cases, frontend,
 * smoke tests) works end-to-end without depending on the 0G Storage SDK being installed
 * and credentialed in the dev sandbox.
 *
 * The blob ID is sha256(content) hex-prefixed with `0x` so it's a valid bytes32 — that
 * matches the on-chain `manifestUri` field type (see types.ts encoding note).
 *
 * To swap to real 0G Storage, replace this with ZeroGStorage (see zerog-storage.ts) and
 * inject it via the storage env var.
 */
export class LocalFsStorage implements IStorageClient {
  constructor(private readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
  }

  async upload(data: Buffer, namespace: "log" | "kv" = "kv"): Promise<BlobId> {
    const hash = createHash("sha256").update(data).digest("hex");
    const id = `0x${hash}`;
    const dir = path.join(this.root, namespace);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, hash), data);
    return id;
  }

  async download(blobId: BlobId): Promise<Buffer> {
    const hex = blobId.startsWith("0x") ? blobId.slice(2) : blobId;
    for (const ns of ["kv", "log"] as const) {
      const p = path.join(this.root, ns, hex);
      if (fs.existsSync(p)) return fs.readFileSync(p);
    }
    throw new Error(`Blob not found: ${blobId}`);
  }
}
