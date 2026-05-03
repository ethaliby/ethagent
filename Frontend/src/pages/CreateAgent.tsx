import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { api } from "../lib/api";

export function CreateAgent() {
  const { address } = useAccount();
  const [owner, setOwner] = useState("");
  const [ensLabel, setEnsLabel] = useState("");
  const [persona, setPersona] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  const effectiveOwner = owner || address || "";
  const valid = /^0x[0-9a-fA-F]{40}$/.test(effectiveOwner);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError("Connect a wallet or paste a valid 0x address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.createAgent({
        owner: effectiveOwner,
        ensLabel: ensLabel || undefined,
        persona: persona || undefined
      });
      nav(`/agents/${r.agentId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="border-b border-line pb-8 mb-10">
        <div className="eyebrow mb-2">// mint</div>
        <h1 className="display text-4xl md:text-5xl text-fg">Create agent</h1>
        <p className="text-muted text-sm mt-2 max-w-lg">
          Mints an ERC-7857 iNFT with a freshly generated 256-bit Root Master Key.
          Empty commit chain, ready to learn.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-10">
        <Field num="01" label="owner address" hint={address && !owner ? "defaults to connected wallet" : undefined}>
          <input
            className="input input-mono"
            placeholder={address || "0x…"}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
        </Field>

        <Field num="02" label="ENS label" hint="optional · creates <label>.siriusagents.eth">
          <div className="flex items-stretch border border-line2 focus-within:border-fg transition">
            <input
              className="input border-0 flex-1 input-mono"
              placeholder="aria"
              value={ensLabel}
              onChange={(e) => setEnsLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            />
            <span
              className="bg-surface px-4 flex items-center text-sm text-muted border-l border-line2"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              .siriusagents.eth
            </span>
          </div>
        </Field>

        <Field num="03" label="persona" hint="how the agent describes itself">
          <textarea
            className="input min-h-[110px] resize-none"
            placeholder="Aria — research assistant. Concise, code-friendly."
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
          />
        </Field>

        {error && (
          <div className="border border-bad/30 bg-bad/5 text-bad p-3 text-sm">{error}</div>
        )}

        <div className="border-t border-line pt-6">
          <button className="btn btn-accent w-full text-base py-3.5" disabled={submitting || !valid}>
            {submitting ? "Minting…" : "Mint agent"}
            <Arrow />
          </button>
          <p
            className="mt-3 text-center text-[10px] uppercase tracking-widest2 text-muted2"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            one transaction · ~70k gas · sealed RMK on 0G
          </p>
        </div>
      </form>
    </div>
  );
}

function Field({
  num,
  label,
  hint,
  children
}: {
  num: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
      <span className="num text-3xl shrink-0 w-12">{num}</span>
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="label !mb-0">{label}</span>
          {hint && (
            <span
              className="text-[10px] uppercase tracking-widest2 text-muted2"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {hint}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 10 8" className="h-3 w-3" fill="currentColor">
      <path d="M4.45 0.39h1.57L9.3 4l-3.28 3.61H4.45L7.4 4.59H0.7V3.43h6.72L4.45 0.39z" />
    </svg>
  );
}
