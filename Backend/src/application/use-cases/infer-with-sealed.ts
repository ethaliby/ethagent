import { PrismaClient } from "@prisma/client";
import { IComputeClient } from "../../domain/interfaces";
import { Hash } from "../../domain/types";
import { ReadMemoryUseCase } from "./read-memory";

export interface InferInput {
  agentId: string;
  prompt: string;
  /** Max number of memory entries to inject as context. */
  contextLimit?: number;
}

export interface InferOutput {
  output: string;
  attestation: { provider: string; ts: number };
  memoryCount: number;
  teeSignature: string;
}

export class InferWithSealedComputeUseCase {
  constructor(
    private prisma: PrismaClient,
    private compute: IComputeClient,
    private readMemory: ReadMemoryUseCase
  ) {}

  async execute(input: InferInput): Promise<InferOutput> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: input.agentId },
      include: { commits: { orderBy: { timestamp: "asc" } } }
    });
    if (!agent) throw new Error(`Agent not found: ${input.agentId}`);

    // Read every commit and accumulate unique memories.
    // A real OpenClaw agent would have semantic search over the full chain;
    // here we cumulate by entryId (last write wins per entry).
    const seen = new Map<string, { type: string; plaintext: string; tags: string[] }>();
    for (const c of agent.commits) {
      try {
        const r = await this.readMemory.execute({
          agentId: input.agentId,
          commitHash: c.hash as Hash
        });
        for (const e of r.entries) {
          seen.set(e.id, { type: e.type, plaintext: e.plaintext, tags: e.tags });
        }
      } catch {
        // Skip commits that can't be read (e.g. on-chain state lost after a node restart).
      }
    }

    // Fallback to HEAD-only read if for some reason the loop yielded nothing.
    if (seen.size === 0) {
      const head = await this.readMemory.execute({ agentId: input.agentId });
      for (const e of head.entries) {
        seen.set(e.id, { type: e.type, plaintext: e.plaintext, tags: e.tags });
      }
    }

    const all = Array.from(seen.values());
    const limit = input.contextLimit ?? 24;
    const used = all.slice(-limit);

    const r = await this.compute.sealedInference({
      model: "qwen3.6-plus",
      prompt: input.prompt,
      encryptedMemoryBlobIds: [],
      sealedRmkId: agent.rmkSealId,
      plaintextMemories: used.map((e) => `(${e.type}) ${e.plaintext}`)
    });

    return {
      output: r.output,
      attestation: r.attestation,
      memoryCount: used.length,
      teeSignature: r.teeSignature
    };
  }
}
