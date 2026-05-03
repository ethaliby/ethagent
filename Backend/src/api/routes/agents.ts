import { Router } from "express";
import { z } from "zod";
import { Container } from "../../application/container";
import { Address, Hash, MemoryEntryInput } from "../../domain/types";

const HEX_ADDR = /^0x[0-9a-fA-F]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;

const CreateAgentSchema = z.object({
  owner: z.string().regex(HEX_ADDR),
  ensLabel: z.string().min(1).max(63).optional(),
  persona: z.string().max(2000).optional()
});

const CommitSchema = z.object({
  message: z.string().min(1).max(500),
  entries: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.enum(["memory_chunk", "persona_delta", "skill"]),
        content: z.string().min(1),
        tags: z.array(z.string()).optional()
      })
    )
    .min(1),
  metadata: z.record(z.unknown()).optional()
});

const ForkSchema = z.object({
  atCommit: z.string().regex(HEX32),
  newOwner: z.string().regex(HEX_ADDR)
});

const ReadSchema = z.object({
  commitHash: z.string().regex(HEX32).optional()
});

const InferSchema = z.object({
  prompt: z.string().min(1).max(8000),
  contextLimit: z.number().int().positive().optional()
});

export function buildAgentsRouter(c: Container): Router {
  const r = Router();

  // POST /agents
  r.post("/", async (req, res, next) => {
    try {
      const input = CreateAgentSchema.parse(req.body);
      const out = await c.createAgent.execute({
        owner: input.owner as Address,
        ensLabel: input.ensLabel,
        persona: input.persona
      });
      res.json({
        agentId: out.agentId,
        tokenId: out.tokenId.toString(),
        rmkSealId: out.rmkSealId,
        ensName: out.ensName,
        txHash: out.txHash,
        contract: c.cfg.contractAddress
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /agents/:idOrEns
  r.get("/:idOrEns", async (req, res, next) => {
    try {
      const key = req.params.idOrEns;
      let agent = await c.prisma.agent.findUnique({ where: { id: key } });
      if (!agent) agent = await c.prisma.agent.findUnique({ where: { ensName: key } });
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const tokenId = BigInt(agent.tokenId);
      const repo = await c.chain.getRepository(tokenId);
      const owner = await c.chain.ownerOf(tokenId);
      const commits = await c.prisma.commit.findMany({
        where: { agentId: agent.id },
        orderBy: { timestamp: "asc" },
        select: {
          hash: true,
          parentHash: true,
          manifestUri: true,
          merkleRoot: true,
          message: true,
          timestamp: true,
          txHash: true
        }
      });
      res.json({
        id: agent.id,
        tokenId: agent.tokenId,
        ensName: agent.ensName,
        ownerAddress: owner,
        persona: agent.persona,
        head: repo.head,
        rmkSealId: repo.rmkSealId,
        parentTokenId: repo.parentTokenId.toString(),
        parentCommit: repo.parentCommit,
        contract: c.cfg.contractAddress,
        commits
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /agents/:id/lineage
  r.get("/:id/lineage", async (req, res, next) => {
    try {
      const agent = await c.prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const ancestors = await c.chain.getLineage(BigInt(agent.tokenId));
      res.json({ tokenId: agent.tokenId, ancestors: ancestors.map((a) => a.toString()) });
    } catch (e) {
      next(e);
    }
  });

  // POST /agents/:id/commits
  r.post("/:id/commits", async (req, res, next) => {
    try {
      const input = CommitSchema.parse(req.body);
      const out = await c.commitMemory.execute({
        agentId: req.params.id,
        entries: input.entries as MemoryEntryInput[],
        message: input.message,
        metadata: input.metadata
      });
      res.json({
        commitHash: out.commitHash,
        parent: out.parent,
        manifestUri: out.manifestUri,
        merkleRoot: out.merkleRoot,
        txHash: out.txHash,
        entryCount: out.entryCount
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /agents/:id/commits
  r.get("/:id/commits", async (req, res, next) => {
    try {
      const agent = await c.prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const commits = await c.prisma.commit.findMany({
        where: { agentId: agent.id },
        orderBy: { timestamp: "asc" }
      });
      res.json({ commits });
    } catch (e) {
      next(e);
    }
  });

  // GET /agents/:id/commits/:hash
  r.get("/:id/commits/:hash", async (req, res, next) => {
    try {
      const agent = await c.prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const commit = await c.prisma.commit.findFirst({
        where: { agentId: agent.id, hash: req.params.hash },
        include: { entries: true }
      });
      if (!commit) {
        res.status(404).json({ error: "Commit not found" });
        return;
      }
      res.json(commit);
    } catch (e) {
      next(e);
    }
  });

  // GET /agents/:id/commits/:hash/manifest
  r.get("/:id/commits/:hash/manifest", async (req, res, next) => {
    try {
      const agent = await c.prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const tokenId = BigInt(agent.tokenId);
      const onchain = await c.chain.getCommit(tokenId, req.params.hash as Hash);
      const buf = await c.storage.download(onchain.manifestUri as string);
      res.type("application/json").send(buf.toString("utf8"));
    } catch (e) {
      next(e);
    }
  });

  // GET /agents/:id/diff?from=&to=
  r.get("/:id/diff", async (req, res, next) => {
    try {
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      if (!HEX32.test(from) || !HEX32.test(to)) {
        res.status(400).json({ error: "from/to must be bytes32 hex" });
        return;
      }
      const agent = await c.prisma.agent.findUnique({ where: { id: req.params.id } });
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const out = await c.diffCommits.execute({
        tokenId: BigInt(agent.tokenId),
        from: from as Hash,
        to: to as Hash
      });
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  // POST /agents/:id/read
  r.post("/:id/read", async (req, res, next) => {
    try {
      const input = ReadSchema.parse(req.body || {});
      const out = await c.readMemory.execute({
        agentId: req.params.id,
        commitHash: input.commitHash as Hash | undefined
      });
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  // POST /agents/:id/infer
  r.post("/:id/infer", async (req, res, next) => {
    try {
      const input = InferSchema.parse(req.body);
      const out = await c.infer.execute({
        agentId: req.params.id,
        prompt: input.prompt,
        contextLimit: input.contextLimit
      });
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  // POST /agents/:id/fork
  r.post("/:id/fork", async (req, res, next) => {
    try {
      const input = ForkSchema.parse(req.body);
      const out = await c.forkAgent.execute({
        parentAgentId: req.params.id,
        atCommit: input.atCommit as Hash,
        newOwner: input.newOwner as Address
      });
      res.json({
        childAgentId: out.childAgentId,
        childTokenId: out.childTokenId.toString(),
        newRmkSealId: out.newRmkSealId,
        txHash: out.txHash
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /agents (list)
  r.get("/", async (_req, res, next) => {
    try {
      const agents = await c.prisma.agent.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { commits: true } } }
      });
      res.json({
        agents: agents.map((a) => ({
          id: a.id,
          tokenId: a.tokenId,
          ensName: a.ensName,
          ownerAddress: a.ownerAddress,
          persona: a.persona,
          parentTokenId: a.parentTokenId,
          createdAt: a.createdAt,
          commitCount: a._count.commits
        }))
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
