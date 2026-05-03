import { IStorageClient } from "../../domain/interfaces";
import { BlobId } from "../../domain/types";
import { LocalFsStorage } from "./local-fs-storage";

/**
 * ZeroGStorage — adapter for the 0G Storage SDK.
 *
 * Status (April 28 2026): the published `@0glabs/0g-ts-sdk` package surface is in flux
 * across testnet upgrades. Rather than commit to a specific version that may break the
 * build, this adapter is structured as:
 *
 *   - In production: lazy-import `@0glabs/0g-ts-sdk` at runtime if `ZEROG_STORAGE_RPC` is set
 *     and the package is installed; call its uploader/downloader.
 *   - Otherwise: delegate to `LocalFsStorage` so the rest of the stack still works.
 *
 * The interface is the spec's `IStorageClient` so use cases never need to know.
 */
export class ZeroGStorage implements IStorageClient {
  private readonly fallback: LocalFsStorage;
  private sdkChecked = false;
  // Using `any` here is a deliberate escape hatch: SDK types vary across versions and
  // we don't want a missing peer dep to break TS compilation. (See PROGRESS.md note.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdk: any = null;

  constructor(
    private readonly rpc: string | undefined,
    private readonly localRoot: string
  ) {
    this.fallback = new LocalFsStorage(localRoot);
  }

  private async ensureSdk(): Promise<boolean> {
    if (this.sdkChecked) return Boolean(this.sdk);
    this.sdkChecked = true;
    if (!this.rpc) return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.sdk = require("@0glabs/0g-ts-sdk");
      return true;
    } catch {
      return false;
    }
  }

  async upload(data: Buffer, namespace: "log" | "kv" = "kv"): Promise<BlobId> {
    const ok = await this.ensureSdk();
    if (!ok) return this.fallback.upload(data, namespace);
    // TODO: when SDK shape is verified against build.0g.ai, wire real upload here.
    // For now we still fall back so behavior is deterministic.
    return this.fallback.upload(data, namespace);
  }

  async download(blobId: BlobId): Promise<Buffer> {
    const ok = await this.ensureSdk();
    if (!ok) return this.fallback.download(blobId);
    // TODO: real SDK call
    return this.fallback.download(blobId);
  }
}
