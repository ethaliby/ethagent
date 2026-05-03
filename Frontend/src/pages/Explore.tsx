import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function ExplorePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["agents"], queryFn: api.listAgents });

  return (
    <div className="space-y-10">
      <header className="border-b border-line pb-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="eyebrow mb-2">// registry</div>
            <h1 className="display text-4xl md:text-6xl text-fg">Explore</h1>
            <p className="text-muted text-sm mt-2 max-w-md">
              Every minted agent on this network. Click any row to inspect its commit chain.
            </p>
          </div>
          <Link to="/agents/new" className="btn btn-accent">
            Mint agent
            <Arrow />
          </Link>
        </div>
      </header>

      {isLoading && <Skeleton />}
      {error && (
        <div className="border border-bad/30 bg-bad/5 text-bad p-4 text-sm">
          {(error as Error).message}
        </div>
      )}

      {data && data.agents.length === 0 && (
        <div className="border border-dashed border-line2 p-16 text-center">
          <p className="text-muted text-sm mb-5">No agents minted yet.</p>
          <Link to="/agents/new" className="btn btn-accent">
            Mint the first one
            <Arrow />
          </Link>
        </div>
      )}

      <ul className="border-y border-line divide-y divide-line">
        {data?.agents.map((a, i) => (
          <li key={a.id}>
            <Link
              to={`/agents/${a.id}`}
              className="group grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto] items-center gap-4 md:gap-6 py-6 px-2 hover:bg-surface/40 transition"
            >
              <span className="num text-2xl md:text-3xl shrink-0 w-12">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="display text-lg md:text-xl text-fg truncate">
                    {a.ensName ?? `agent ${a.tokenId}`}
                  </span>
                  {a.parentTokenId ? (
                    <span
                      className="text-[10px] uppercase tracking-widest2 px-2 py-0.5 border border-line2 text-muted"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      fork ↳ #{a.parentTokenId}
                    </span>
                  ) : (
                    <span
                      className="text-[10px] uppercase tracking-widest2 px-2 py-0.5 border border-line2 text-muted"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      root
                    </span>
                  )}
                </div>
                {a.persona && (
                  <p className="text-sm text-muted mt-1 line-clamp-2">{a.persona}</p>
                )}
              </div>
              <div
                className="hidden md:flex flex-col items-end gap-0.5 text-[11px] text-muted shrink-0"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                <span>token #{a.tokenId}</span>
                <span style={{ color: "#FF4D00" }}>{a.commitCount} commits</span>
              </div>
              <span className="text-muted2 group-hover:text-fg transition-colors shrink-0">
                <Arrow />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Skeleton() {
  return (
    <ul className="border-y border-line divide-y divide-line">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="py-6 px-2 animate-pulse">
          <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center">
            <span className="h-6 w-12 bg-line" />
            <div>
              <div className="h-5 w-1/3 bg-line mb-2" />
              <div className="h-3 w-2/3 bg-line/60" />
            </div>
            <div className="h-3 w-16 bg-line" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 10 8" className="h-3 w-3" fill="currentColor">
      <path d="M4.45 0.39h1.57L9.3 4l-3.28 3.61H4.45L7.4 4.59H0.7V3.43h6.72L4.45 0.39z" />
    </svg>
  );
}
