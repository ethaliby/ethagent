import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Msg {
  role: "user" | "agent";
  content: string;
  attestation?: { provider: string };
  memoryCount?: number;
}

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id
  });
  const [prompt, setPrompt] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, busy]);

  async function send() {
    if (!prompt.trim() || !id) return;
    const userMsg: Msg = { role: "user", content: prompt };
    setMsgs((m) => [...m, userMsg]);
    setPrompt("");
    setBusy(true);
    try {
      const r = await api.infer(id, { prompt: userMsg.content });
      setMsgs((m) => [
        ...m,
        {
          role: "agent",
          content: r.output,
          attestation: r.attestation,
          memoryCount: r.memoryCount
        }
      ]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "agent", content: `Error: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="border-b border-line pb-8 mb-10">
        <div className="eyebrow mb-2">// inference</div>
        <h1 className="display text-3xl md:text-5xl text-fg truncate">
          Chat with {agent?.ensName ?? `agent ${agent?.tokenId ?? ""}`}
        </h1>
        <p className="text-muted text-sm mt-2">
          Inference uses the agent's full memory chain · {agent?.commits.length ?? 0} commits available
        </p>
      </header>

      {/* Conversation */}
      <div className="border border-line bg-surface/40 p-5 md:p-6 mb-4 min-h-[320px] max-h-[60vh] overflow-y-auto space-y-5">
        {msgs.length === 0 && (
          <div
            className="text-center py-12 text-[11px] uppercase tracking-widest2 text-muted2"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            // say hi — the agent draws from its committed memories
          </div>
        )}

        {msgs.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}

        {busy && (
          <div className="flex items-start gap-3">
            <Avatar agent />
            <div className="border border-line2 bg-bg px-4 py-3">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-fg animate-typing" />
                <span className="h-1.5 w-1.5 rounded-full bg-fg animate-typing" style={{ animationDelay: "0.15s" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-fg animate-typing" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 border border-line2 p-1">
        <input
          className="flex-1 bg-transparent border-0 px-4 py-3 text-fg placeholder-muted2 focus:outline-none"
          placeholder="ask the agent something…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && send()}
        />
        <button
          className="btn btn-accent !rounded-none"
          disabled={busy || !prompt.trim()}
          onClick={send}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar agent={!isUser} />
      <div className="max-w-[80%]">
        <div
          className={`px-4 py-3 text-sm whitespace-pre-wrap ${
            isUser
              ? "bg-fg text-bg"
              : "border border-line2 bg-bg text-fg"
          }`}
        >
          {msg.content}
        </div>
        {!isUser && msg.attestation && (
          <div
            className="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-widest2"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            <ProviderBadge provider={msg.attestation.provider} />
            {msg.memoryCount !== undefined && (
              <span className="text-muted2">{msg.memoryCount} memories used</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ agent = false }: { agent?: boolean }) {
  if (agent) {
    return (
      <span
        className="shrink-0 h-8 w-8 border border-line2 flex items-center justify-center"
        style={{ background: "#0B0B0B", color: "#FF4D00" }}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="shrink-0 h-8 w-8 border border-line2 bg-surface flex items-center justify-center text-muted text-xs"
      style={{ fontFamily: "JetBrains Mono, monospace" }}
    >
      you
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  if (provider === "0g-sealed") {
    return (
      <span className="px-2 py-0.5 border" style={{ color: "#FF4D00", borderColor: "#FF4D00" }}>
        ✓ TEE-verified · 0G sealed
      </span>
    );
  }
  if (provider === "anthropic-fallback") {
    return (
      <span className="px-2 py-0.5 border border-line2 text-muted">
        fallback · anthropic
      </span>
    );
  }
  return <span className="px-2 py-0.5 border border-line2 text-muted2">stub</span>;
}
