/**
 * End-to-end smoke test for the Backend.
 *
 *   1. mint an agent
 *   2. commit memory (3 entries)
 *   3. read it back
 *   4. verify the merkle root computed locally matches what we wrote on chain
 *   5. fork at HEAD, verify lineage on chain
 *
 * Runs against whatever chain is configured in .env / contracts/deployments/<network>.json.
 * Defaults to localhost (Hardhat).
 */

import { buildContainer } from "../src/application/container";
import { Address, Hash } from "../src/domain/types";

async function main() {
  const c = buildContainer();
  const log = c.log;
  const owner = c.chain.signerAddress;

  log.info(`Smoke: signer ${owner}, contract ${c.cfg.contractAddress}`);

  // 1. Create agent
  log.info("1) creating agent…");
  const created = await c.createAgent.execute({
    owner: owner as Address,
    persona: "Aria the Research Assistant — concise, code-friendly explanations."
  });
  log.info(
    { agentId: created.agentId, tokenId: created.tokenId.toString(), tx: created.txHash },
    "agent created"
  );

  // 2. Commit 3 memory entries.
  log.info("2) committing 3 memory entries…");
  const c1 = await c.commitMemory.execute({
    agentId: created.agentId,
    message: "session 1 — initial preferences",
    entries: [
      {
        type: "persona_delta",
        content: "User prefers concise explanations with code examples.",
        tags: ["preference", "user-style"]
      },
      {
        type: "memory_chunk",
        content: "Discussed transformer attention mechanisms; user is familiar with PyTorch.",
        tags: ["topic:ml", "skill:pytorch"]
      }
    ]
  });
  log.info({ c1 }, "commit 1 done");

  const c2 = await c.commitMemory.execute({
    agentId: created.agentId,
    message: "session 2 — research notes",
    entries: [
      {
        type: "memory_chunk",
        content:
          "Read paper on FlashAttention v3; user wants to apply to a 7B model on consumer GPU.",
        tags: ["topic:ml", "paper"]
      }
    ]
  });
  log.info({ c2 }, "commit 2 done");

  const c3 = await c.commitMemory.execute({
    agentId: created.agentId,
    message: "session 3 — skill update",
    entries: [
      {
        type: "skill",
        content: "Can scaffold a minimal PyTorch training loop with mixed precision.",
        tags: ["skill:pytorch", "skill:training"]
      },
      {
        type: "persona_delta",
        content: "User explicitly asked for terse responses going forward.",
        tags: ["preference"]
      }
    ]
  });
  log.info({ c3 }, "commit 3 done");

  // 3. Read it back at HEAD.
  log.info("3) reading memory at HEAD…");
  const read = await c.readMemory.execute({ agentId: created.agentId });
  log.info({ entryCount: read.entries.length, merkleVerified: read.merkleVerified }, "read done");
  if (!read.merkleVerified) throw new Error("Merkle verification failed!");

  // 4. Diff c1 → c3
  log.info("4) diffing c1 → c3…");
  const diff = await c.diffCommits.execute({
    tokenId: created.tokenId,
    from: c1.commitHash,
    to: c3.commitHash
  });
  log.info(
    {
      added: diff.added.length,
      removed: diff.removed.length,
      modified: diff.modified.length,
      unchanged: diff.unchanged
    },
    "diff done"
  );

  // 5. Fork at c2.
  log.info("5) forking at c2…");
  const fork = await c.forkAgent.execute({
    parentAgentId: created.agentId,
    atCommit: c2.commitHash,
    newOwner: owner as Address
  });
  log.info(
    { childAgentId: fork.childAgentId, childTokenId: fork.childTokenId.toString() },
    "fork done"
  );

  // 6. Verify lineage on chain.
  const lineage = await c.chain.getLineage(fork.childTokenId);
  log.info({ lineage: lineage.map(String) }, "child lineage");
  if (lineage.length !== 1 || lineage[0] !== created.tokenId) {
    throw new Error("Lineage mismatch");
  }

  // 7. ENS verify (will be mocked unless real config is set; we still call it)
  if (created.ensName) {
    const verify = await c.verifyEns.execute({ ensName: created.ensName });
    log.info({ verify }, "ENS verify done");
  }

  log.info("✅ smoke test passed");
  await c.prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
