import { IComputeClient } from "../../domain/interfaces";
import { BlobId } from "../../domain/types";

interface ComputeConfig {
  zerogEndpoint?: string;
  zerogApiKey?: string;
  zerogModel?: string;
  anthropicApiKey?: string;
  /** Persona / system prompt the agent ships with. */
  systemPrompt?: string;
}

/**
 * 0G Compute Sealed Inference client with multi-stage fallback:
 *
 *   1. If ZEROG_COMPUTE_ENDPOINT is set: try the 0G Compute SDK (TODO — pending stable
 *      package surface; currently treated as unimplemented).
 *   2. If ANTHROPIC_API_KEY is set: call Claude (claude-sonnet-4-6) with plaintext memories
 *      injected into the system prompt. Returns attestation.provider = "anthropic-fallback".
 *   3. Otherwise: deterministic stub for offline demos.
 *
 * Per spec §9.3, the fallback is explicitly authorized.
 */
export class ZeroGComputeClient implements IComputeClient {
  constructor(private readonly cfg: ComputeConfig) {}

  async sealedInference(req: {
    model: string;
    prompt: string;
    encryptedMemoryBlobIds: BlobId[];
    sealedRmkId: BlobId;
    plaintextMemories?: string[];
  }) {
    const ts = Date.now();

    // Stage 1: 0G Compute (placeholder — wire in when SDK is stable)
    if (this.cfg.zerogEndpoint && this.cfg.zerogApiKey) {
      // TODO: real SDK call to 0G Compute Sealed Inference.
    }

    // Stage 2: Anthropic fallback (decrypted memories already passed in by use case)
    if (this.cfg.anthropicApiKey) {
      const memories = req.plaintextMemories ?? [];
      const system =
        (this.cfg.systemPrompt ??
          "You are an AI agent with versioned long-term memory powered by Sirius for Agents.") +
        (memories.length
          ? `\n\nYour memories so far:\n${memories.map((m, i) => `[${i + 1}] ${m}`).join("\n")}`
          : "");

      const body = {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: req.prompt }]
      };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.cfg.anthropicApiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${txt}`);
      }
      const json = (await res.json()) as {
        content: Array<{ type: string; text?: string }>;
      };
      const output = json.content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
      return {
        output,
        teeSignature: "fallback",
        attestation: { provider: "anthropic-fallback" as const, ts }
      };
    }

    // Stage 3: deterministic stub
    const output = this.stubResponse(req.prompt, req.plaintextMemories ?? []);
    return {
      output,
      teeSignature: "stub",
      attestation: { provider: "stub" as const, ts }
    };
  }

  /**
   * Local mock model — no external API call.
   *
   * Strategy:
   *   1. Tokenize the prompt (drop stopwords, keep keywords).
   *   2. Score each memory by keyword overlap + tag match (memory entries have
   *      `(type) content` shape after the use case formats them).
   *   3. Detect intent: greeting / recall / preference / question / unknown.
   *   4. Compose a response that quotes the most relevant memories verbatim.
   *
   * It looks like the agent reasoned over its own commit chain. It's deterministic,
   * runs offline, and is faithful to the memories actually committed on chain.
   */
  private stubResponse(prompt: string, memories: string[]): string {
    const STOPWORDS = new Set([
      "the","a","an","of","to","is","are","was","were","be","been","being","do","does",
      "did","have","has","had","you","i","me","my","your","we","our","it","its","for",
      "with","on","in","at","by","from","as","that","this","these","those","and","or",
      "but","not","no","so","if","then","than","what","who","when","where","why","how",
      "can","could","should","would","will","may","might","must","up","down","out","over",
      "again","just","too","very","also","about","tell","know"
    ]);
    const tokens = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t));

    // Score each memory
    const scored = memories
      .map((m) => {
        const lm = m.toLowerCase();
        let score = 0;
        for (const t of tokens) if (lm.includes(t)) score += 1;
        return { m, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.m);

    const lower = prompt.toLowerCase();
    const isGreet = /^(hi|hello|hey|yo|sup|salut|coucou)\b/.test(lower) || /^how are you/.test(lower);
    const isWhoami = /(who are you|what are you|what's your name|tell me about yourself)/i.test(prompt);
    const isRecall =
      /(remember|recall|do you (know|remember)|what did|what do you know|tell me about|told you|earlier|before)/i.test(
        prompt
      );
    const isPreference = /(prefer|like|hate|dislike|love)/i.test(prompt);
    const isList = /(what (do|did) you (learn|know)|list (your|the) memor|show me)/i.test(prompt);

    // Helper to format memory excerpts
    const fmt = (m: string) => m.replace(/^\(([^)]+)\)\s*/, "[$1] ").replace(/\s+/g, " ").trim();

    if (isGreet) {
      if (memories.length === 0) {
        return "Hello. I have an empty memory chain so far — start a session by committing a few memories and I'll begin learning.";
      }
      return `Hello again. I have ${memories.length} memories on my chain, including: ${fmt(memories[memories.length - 1]).slice(0, 140)}…`;
    }

    if (isWhoami) {
      if (memories.length === 0) {
        return "I'm a Sirius agent — versioned, encrypted memory anchored on 0G. My chain is empty for now.";
      }
      const persona = memories.find((m) => m.startsWith("(persona_delta)"));
      if (persona)
        return `Based on my persona deltas: ${fmt(persona)}. I have ${memories.length} memories total.`;
      return `I'm a Sirius agent. ${memories.length} memories on chain, latest: ${fmt(memories[memories.length - 1]).slice(0, 160)}`;
    }

    if (isList) {
      if (memories.length === 0) return "My chain is empty — no memories committed yet.";
      const lines = memories.slice(-5).map((m, i) => `${i + 1}. ${fmt(m)}`);
      return `My most recent ${Math.min(5, memories.length)} memories:\n\n${lines.join("\n")}`;
    }

    if (isPreference) {
      const prefs = memories.filter(
        (m) => m.startsWith("(persona_delta)") || /prefer|like|hate|dislike/i.test(m)
      );
      if (prefs.length) {
        return `From my preference deltas: ${prefs.slice(-2).map(fmt).join(" — ")}.`;
      }
      return "I don't have preference deltas on this topic yet — feel free to teach me.";
    }

    if (scored.length > 0) {
      const lead = isRecall
        ? `Yes, I have related memories on chain. Top match${scored.length > 1 ? "es" : ""}:`
        : `Drawing on my commit chain:`;
      const body = scored.map((m, i) => `  ${i + 1}. ${fmt(m)}`).join("\n");
      return `${lead}\n\n${body}\n\n(Local mock model — analyzing my own ${memories.length}-memory commit chain. No external LLM call.)`;
    }

    // No keyword overlap found
    if (memories.length === 0) {
      return "My commit chain is empty — I haven't learned anything yet. Start a session with `commit memory` to populate my state.";
    }
    return `I don't have memories that match "${prompt.slice(0, 80)}". My chain has ${memories.length} entries on other topics — try asking about something I might have committed.`;
  }
}
