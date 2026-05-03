import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { api } from "../lib/api";
import { Hash } from "../components/Hash";

export function ForkPage() {
  const { id } = useParams<{ id: string }>();
  const { address } = useAccount();
  const nav = useNavigate();
  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id
  });
  const [atCommit, setAtCommit] = useState<string>("");
  const [newOwner, setNewOwner] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const owner = newOwner || address || "";
  const validOwner = /^0x[0-9a-fA-F]{40}$/.test(owner);
  const validCommit = /^0x[0-9a-f]{64}$/i.test(atCommit);
  const selectedIdx = agent?.commits.findIndex((c) => c.hash === atCommit) ?? -1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (!validOwner) return setErr("Need a valid 0x… owner address.");
    if (!validCommit) return setErr("Pick a commit to fork at.");
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api.fork(id, { atCommit, newOwner: owner });
      nav(`/agents/${r.childAgentId}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="border-b border-line pb-8 mb-10">
        <div className="eyebrow mb-2">// fork</div>
        <h1 className="display text-4xl md:text-5xl text-fg">Fork agent</h1>
        <p className="text-muted text-sm mt-2 max-w-xl">
          Forking mints a new iNFT for the new owner. Lineage is preserved on chain via{" "}
          <code style={{ fontFamily: "JetBrains Mono, monospace" }}>parentTokenId</code> +{" "}
          <code style={{ fontFamily: "JetBrains Mono, monospace" }}>parentCommit</code>.
        </p>
      </header>

      {agent && (
        <div className="border border-line p-6 mb-10">
          <div className="label">// lineage preview</div>
          <div className="flex items-center gap-4 overflow-x-auto py-3">
            <Node label={`#${agent.tokenId}`} sub={agent.ensName ?? "parent"} active />
            <Arrow active={validCommit} />
            <Node
              label="?"
              sub={validCommit ? `at commit ${selectedIdx + 1}` : "pick commit"}
              ghost={!validCommit}
            />
          </div>
          {validCommit && (
            <div
              className="mt-3 text-[11px] flex items-center gap-2 flex-wrap"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              <span className="text-muted">fork point:</span> <Hash value={atCommit} />
            </div>
          )}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <div>
          <label className="label">fork at commit</label>
          <select
            className="input input-mono"
            value={atCommit}
            onChange={(e) => setAtCommit(e.target.value)}
          >
            <option value="">— pick —</option>
            {agent?.commits.map((c, i) => (
              <option key={c.hash} value={c.hash}>
                #{i + 1} · {c.hash.slice(0, 10)}… — {c.message}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">new owner</label>
          <input
            className="input input-mono"
            placeholder={address ?? "0x…"}
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
          />
        </div>

        {err && <div className="border border-bad/30 bg-bad/5 text-bad p-3 text-sm">{err}</div>}

        <div className="border-t border-line pt-6">
          <button
            className="btn btn-accent w-full text-base py-3.5"
            disabled={submitting || !validOwner || !validCommit}
          >
            {submitting ? "Resealing RMK · minting child iNFT…" : "Fork at commit"}
            <ArrowGlyph />
          </button>
        </div>
      </form>
    </div>
  );
}

function Node({
  label,
  sub,
  active = false,
  ghost = false
}: {
  label: string;
  sub: string;
  active?: boolean;
  ghost?: boolean;
}) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <div
        className={`relative h-16 w-16 rounded-full border-2 flex items-center justify-center display text-lg ${
          ghost ? "border-line2 text-muted2" : active ? "border-fg text-fg" : "border-line2 text-fg"
        }`}
        style={!ghost && !active ? { borderColor: "#FF4D00", color: "#FF4D00" } : {}}
      >
        {label}
      </div>
      <div
        className="mt-2 text-[10px] uppercase tracking-widest2 text-muted"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        {sub}
      </div>
    </div>
  );
}

function Arrow({ active }: { active: boolean }) {
  return (
    <div className="flex-1 min-w-[80px] flex items-center">
      <div
        className={`h-px flex-1 transition-colors`}
        style={{ background: active ? "#FF4D00" : "#1E1E1E" }}
      />
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 -ml-1 transition-colors"
        style={{ color: active ? "#FF4D00" : "#1E1E1E" }}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 10 8" className="h-3 w-3" fill="currentColor">
      <path d="M4.45 0.39h1.57L9.3 4l-3.28 3.61H4.45L7.4 4.59H0.7V3.43h6.72L4.45 0.39z" />
    </svg>
  );
}
