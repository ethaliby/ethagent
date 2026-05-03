import { Router } from "express";
import { Container } from "../../application/container";
import { Hash } from "../../domain/types";

export function buildEnsRouter(c: Container): Router {
  const r = Router();

  // POST /ens/refresh — rebuild the (mock) ENS resolver state from the DB.
  // Useful after a backend restart when the in-memory mock has been wiped.
  r.post("/refresh", async (_req, res, next) => {
    try {
      const agents = await c.prisma.agent.findMany({
        where: { ensName: { not: null } },
        include: { commits: { orderBy: { timestamp: "desc" }, take: 1 } }
      });
      let restored = 0;
      for (const a of agents) {
        if (!a.ensName) continue;
        const head = (a.commits[0]?.hash ?? ("0x" + "00".repeat(32))) as Hash;
        const merkle = (a.commits[0]?.merkleRoot ?? ("0x" + "00".repeat(32))) as Hash;
        await c.ens.setAgentRecords(a.ensName, {
          head,
          merkleRoot: merkle,
          repo: `eip155:${c.cfg.chainId}:${c.cfg.contractAddress}:${a.tokenId}`
        });
        const ensClient = c.ens as unknown as { setMockTokenId?: (n: string, t: bigint) => void };
        ensClient.setMockTokenId?.(a.ensName, BigInt(a.tokenId));
        restored++;
      }
      res.json({ restored, agents: agents.length });
    } catch (e) {
      next(e);
    }
  });

  // GET /ens/resolve/:name
  r.get("/resolve/:name", async (req, res, next) => {
    try {
      const out = await c.ens.resolveAgent(req.params.name);
      if (!out) {
        res.status(404).json({ error: "Not resolvable" });
        return;
      }
      res.json({
        ensName: req.params.name,
        tokenId: out.tokenId.toString(),
        head: out.head,
        merkleRoot: out.merkleRoot,
        live: c.ens.isLive
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /ens/verify/:name
  r.get("/verify/:name", async (req, res, next) => {
    try {
      const out = await c.verifyEns.execute({ ensName: req.params.name });
      res.json({ ...out, live: c.ens.isLive });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
