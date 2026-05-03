import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Hash } from "../components/Hash";

const ZERO = "0x" + "00".repeat(32);

export function AgentProfile() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id
  });

  if (isLoading)
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-32 bg-line/50" />
        <div className="grid md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-line/40" />
          ))}
        </div>
      </div>
    );
  if (error)
    return (
      <div className="border border-bad/30 bg-bad/5 text-bad p-4">{(error as Error).message}</div>
    );
  if (!data) return null;

  const hasCommits = data.head !== ZERO;

  return (
    <div className="space-y-16">
      {/* HEADER */}
      <header className="border-b border-line pb-10">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="eyebrow mb-2">// agent · token #{data.tokenId}</div>
            <h1 className="display text-4xl md:text-6xl text-fg truncate">
              {data.ensName ?? `agent ${data.tokenId}`}
            </h1>
            {data.persona && (
              <p className="text-muted text-sm md:text-base mt-3 max-w-2xl">{data.persona}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/agents/${data.id}/commit`} className="btn btn-accent">
              Commit
              <Arrow />
            </Link>
            <Link to={`/agents/${data.id}/chat`} className="btn btn-outline">Chat</Link>
            <Link to={`/agents/${data.id}/diff`} className="btn btn-ghost">Diff</Link>
            <Link to={`/agents/${data.id}/fork`} className="btn btn-ghost">Fork</Link>
          </div>
        </div>
      </header>

      {/* META STRIP */}
      <section
        className="grid grid-cols-2 md:grid-cols-4 divide-x divide-line border-y border-line"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        <Meta k="commits" v={String(data.commits.length)} accent />
        <Meta k="head" v={hasCommits ? "live" : "genesis"} />
        <Meta k="lineage" v={data.parentTokenId === "0" ? "root" : `#${data.parentTokenId}`} />
        <Meta k="contract" v={`${data.contract.slice(0, 6)}…${data.contract.slice(-4)}`} />
      </section>

      {/* META DETAIL */}
      <section className="grid md:grid-cols-2 gap-10">
        <div>
          <div className="label">// HEAD</div>
          <Hash value={hasCommits ? data.head : null} short={false} />
          <div className="label mt-6">// RMK seal</div>
          <Hash value={data.rmkSealId} short={false} />
        </div>
        <div>
          <div className="label">// owner</div>
          <Hash value={data.ownerAddress} short={false} />
          {data.ensName && (
            <>
              <div className="label mt-6">// ENS</div>
              <div className="flex items-center justify-between">
                <code
                  className="accent-text"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  {data.ensName}
                </code>
                <Link
                  to={`/verify?name=${encodeURIComponent(data.ensName)}`}
                  className="text-[11px] uppercase tracking-widest2 text-muted hover:text-fg"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  verify →
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* TIMELINE */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <div className="flex items-baseline gap-4">
            <span className="num text-3xl">01</span>
            <h2 className="display text-2xl md:text-3xl text-fg">Commit chain</h2>
          </div>
          {data.commits.length === 0 && (
            <Link to={`/agents/${data.id}/commit`} className="btn btn-outline text-sm">
              add the first
            </Link>
          )}
        </div>

        {data.commits.length === 0 ? (
          <div className="border border-dashed border-line2 p-12 text-center text-muted text-sm">
            // no commits yet
          </div>
        ) : (
          <ol className="border-y border-line divide-y divide-line">
            {data.commits.map((c, i) => {
              const isHead = c.hash === data.head;
              return (
                <li key={c.hash} className="grid grid-cols-[auto_1fr_auto] gap-4 md:gap-6 items-center px-2 py-5">
                  <span className="num text-2xl shrink-0 w-12">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <Hash value={c.hash} />
                      {isHead && (
                        <span
                          className="text-[10px] uppercase tracking-widest2 px-2 py-0.5 border"
                          style={{
                            color: "#FF4D00",
                            borderColor: "#FF4D00",
                            fontFamily: "JetBrains Mono, monospace"
                          }}
                        >
                          HEAD
                        </span>
                      )}
                    </div>
                    <div className="text-fg text-sm md:text-base">{c.message}</div>
                  </div>
                  <div
                    className="hidden md:block text-right text-[11px] text-muted shrink-0"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    <div>{new Date(c.timestamp).toLocaleString()}</div>
                    <div className="mt-1 flex items-center gap-1 justify-end">
                      merkle <Hash value={c.merkleRoot} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Meta({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className={`text-2xl md:text-3xl ${accent ? "" : "text-fg"}`} style={accent ? { color: "#FF4D00" } : {}}>
        {v}
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-widest2 text-muted2">{k}</div>
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
