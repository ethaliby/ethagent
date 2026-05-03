import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { AnimatedCounter } from "../components/AnimatedCounter";

export function Landing() {
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const { data: list } = useQuery({ queryKey: ["agents"], queryFn: api.listAgents });
  const agents = list?.agents ?? [];
  const totalCommits = agents.reduce((s, a) => s + a.commitCount, 0);

  return (
    <div className="space-y-24">
      {/* HEADER */}
      <header className="border-b border-line pb-10">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="eyebrow mb-3">// dashboard</div>
            <h1 className="display text-4xl md:text-6xl text-fg">
              Versioned state on chain
            </h1>
            <p className="mt-3 text-muted text-sm md:text-base max-w-xl">
              Mint, commit, fork, and verify agents directly from this console.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/agents/new" className="btn btn-primary">
              Mint agent
              <Arrow />
            </Link>
          </div>
        </div>
      </header>

      {/* STATS STRIP — Sirius 2.0 style: big mono numbers, no cards, just rules */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-line border-y border-line">
          <Stat n={agents.length} label="agents minted" />
          <Stat n={totalCommits} label="commits anchored" />
          <Stat n={health?.chainId ?? 0} label="chain id" mono />
          <Stat n={5} suffix="%" label="EIP-2981 royalty" />
        </div>
      </section>

      {/* HEALTH STRIP */}
      {health && (
        <section className="font-mono text-[11px] uppercase tracking-widest2 text-muted2 grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV k="backend" v={health.ok ? "online" : "offline"} dot={health.ok} />
          <KV k="contract" v={`${health.contract.slice(0, 8)}…${health.contract.slice(-4)}`} />
          <KV k="ens" v={health.ensLive ? "live" : "mock"} />
          <KV k="compute" v={health.computeProvider} />
        </section>
      )}

      {/* AGENTS LIST — vertical, not cards */}
      <section>
        <SectionHead num="01" title="Agents" right={<Link to="/explore" className="text-[11px] font-mono uppercase tracking-widest2 text-muted hover:text-fg">view all →</Link>} />
        {agents.length === 0 ? (
          <div className="border border-dashed border-line2 rounded-xl p-12 text-center">
            <p className="text-muted text-sm mb-5">No agents minted yet.</p>
            <Link to="/agents/new" className="btn btn-accent">
              Mint your first
              <Arrow />
            </Link>
          </div>
        ) : (
          <ul className="border-y border-line divide-y divide-line">
            {agents.map((a, i) => (
              <li key={a.id}>
                <Link
                  to={`/agents/${a.id}`}
                  className="group flex items-center gap-6 py-5 hover:bg-surface/40 transition px-2"
                >
                  <span className="num text-2xl md:text-3xl shrink-0 w-12">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="display text-lg md:text-xl text-fg truncate">
                      {a.ensName ?? `agent ${a.tokenId}`}
                    </div>
                    {a.persona && (
                      <p className="text-sm text-muted truncate mt-0.5">{a.persona}</p>
                    )}
                  </div>
                  <div className="hidden md:flex flex-col items-end gap-1 font-mono text-[11px] text-muted shrink-0">
                    <span>token #{a.tokenId}</span>
                    <span className="accent-text">{a.commitCount} commits</span>
                  </div>
                  <span className="text-muted2 group-hover:text-fg transition-colors shrink-0">
                    <Arrow />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* QUICK ACTIONS */}
      <section>
        <SectionHead num="02" title="Quick actions" />
        <div className="grid grid-cols-1 md:grid-cols-3 border border-line rounded-xl divide-y md:divide-y-0 md:divide-x divide-line overflow-hidden">
          <Action to="/agents/new" title="Mint agent" desc="Generate sealed RMK + ERC-7857 iNFT in one tx." />
          <Action to="/explore" title="Browse registry" desc="Every minted agent on this network." />
          <Action to="/verify" title="ENS verify" desc="Verify any agent's state without RPC." />
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────── PARTS ────────────────────────── */

function SectionHead({ num, title, right }: { num: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div className="flex items-baseline gap-4">
        <span className="num text-3xl">{num}</span>
        <h2 className="display text-2xl md:text-3xl text-fg">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function Stat({ n, suffix, label, mono }: { n: number; suffix?: string; label: string; mono?: boolean }) {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div
        className={`text-fg ${mono ? "font-mono text-2xl md:text-3xl" : "display text-3xl md:text-5xl"}`}
      >
        <AnimatedCounter to={n} suffix={suffix} />
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-widest2 text-muted2 font-mono">
        {label}
      </div>
    </div>
  );
}

function KV({ k, v, dot }: { k: string; v: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {dot !== undefined && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${dot ? "bg-ok" : "bg-bad"}`}
        />
      )}
      <span className="text-muted2">{k}</span>
      <span className="text-fg lowercase">{v}</span>
    </div>
  );
}

function Action({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="group p-6 md:p-8 hover:bg-surface/40 transition">
      <div className="display text-xl text-fg group-hover:accent-text transition-colors mb-2">
        {title}
      </div>
      <p className="text-sm text-muted">{desc}</p>
      <div className="mt-4 text-muted2 group-hover:text-fg transition-colors">
        <Arrow />
      </div>
    </Link>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 10 8" className="h-3 w-3" fill="currentColor">
      <path d="M4.45 0.39h1.57L9.3 4l-3.28 3.61H4.45L7.4 4.59H0.7V3.43h6.72L4.45 0.39z" />
    </svg>
  );
}
