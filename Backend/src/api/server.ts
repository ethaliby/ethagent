import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { buildContainer } from "../application/container";
import { Hash } from "../domain/types";
import { buildAgentsRouter } from "./routes/agents";
import { buildEnsRouter } from "./routes/ens";

// Make BigInt JSON-serializable as strings (Prisma returns BigInt for SQLite Int columns
// in some configs, and viem returns BigInt natively).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function main() {
  const c = buildContainer();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  // Healthcheck
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      chainId: c.cfg.chainId,
      contract: c.cfg.contractAddress,
      ensLive: c.ens.isLive,
      computeProvider: c.cfg.anthropicApiKey
        ? "anthropic-fallback"
        : c.cfg.computeApiKey
          ? "0g-sealed"
          : "stub"
    });
  });

  app.use("/agents", buildAgentsRouter(c));
  app.use("/ens", buildEnsRouter(c));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    c.log.error({ err }, "request failed");
    const status = (err as Error & { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: err.message });
  });

  app.listen(c.cfg.port, async () => {
    c.log.info(`sirius backend listening on :${c.cfg.port}`);
    c.log.info(`  chain id: ${c.cfg.chainId}, rpc: ${c.cfg.rpcUrl}`);
    c.log.info(`  contract: ${c.cfg.contractAddress}`);
    c.log.info(`  ens live: ${c.ens.isLive}`);

    // Rehydrate ENS mock map from DB so verify keeps working across backend restarts.
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
        const ensClient = c.ens as unknown as {
          setMockTokenId?: (n: string, t: bigint) => void;
        };
        ensClient.setMockTokenId?.(a.ensName, BigInt(a.tokenId));
        restored++;
      }
      if (restored > 0) {
        c.log.info(`  rehydrated ${restored} ENS record${restored === 1 ? "" : "s"} from DB`);
      }
    } catch (e) {
      c.log.warn({ err: e }, "ENS rehydration failed (non-fatal)");
    }
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
