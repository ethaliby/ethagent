import { IBlockchainClient, IStorageClient } from "../../domain/interfaces";
import { Hash, Manifest, ManifestEntry } from "../../domain/types";

export interface DiffInput {
  tokenId: bigint;
  from: Hash;
  to: Hash;
}

export interface EntryDiff {
  id: string;
  status: "added" | "removed" | "modified" | "unchanged";
  type: string;
  fromSha?: string;
  toSha?: string;
}

export interface DiffOutput {
  from: Hash;
  to: Hash;
  added: EntryDiff[];
  removed: EntryDiff[];
  modified: EntryDiff[];
  unchanged: number;
}

export class DiffCommitsUseCase {
  constructor(
    private chain: IBlockchainClient,
    private storage: IStorageClient
  ) {}

  async execute(input: DiffInput): Promise<DiffOutput> {
    const fromCommit = await this.chain.getCommit(input.tokenId, input.from);
    const toCommit = await this.chain.getCommit(input.tokenId, input.to);
    const fromManifest = JSON.parse(
      (await this.storage.download(fromCommit.manifestUri as string)).toString("utf8")
    ) as Manifest;
    const toManifest = JSON.parse(
      (await this.storage.download(toCommit.manifestUri as string)).toString("utf8")
    ) as Manifest;

    const fromMap = new Map<string, ManifestEntry>(fromManifest.entries.map((e) => [e.id, e]));
    const toMap = new Map<string, ManifestEntry>(toManifest.entries.map((e) => [e.id, e]));

    const added: EntryDiff[] = [];
    const removed: EntryDiff[] = [];
    const modified: EntryDiff[] = [];
    let unchanged = 0;

    for (const [id, e] of toMap) {
      const before = fromMap.get(id);
      if (!before) {
        added.push({ id, status: "added", type: e.type, toSha: e.sha256 });
      } else if (before.sha256 !== e.sha256) {
        modified.push({
          id,
          status: "modified",
          type: e.type,
          fromSha: before.sha256,
          toSha: e.sha256
        });
      } else {
        unchanged++;
      }
    }
    for (const [id, e] of fromMap) {
      if (!toMap.has(id)) {
        removed.push({ id, status: "removed", type: e.type, fromSha: e.sha256 });
      }
    }

    return { from: input.from, to: input.to, added, removed, modified, unchanged };
  }
}
