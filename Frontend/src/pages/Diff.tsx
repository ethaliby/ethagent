import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Hash } from "../components/Hash";
import { AnimatedCounter } from "../components/AnimatedCounter";
import { TypeIcon } from "../components/TypeIcon";

export function DiffPage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id
  });

  const commits = agent?.commits ?? [];
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    if (!from && commits.length >= 2) setFrom(commits[0].hash);
    if (!to && commits.length >= 1) setTo(commits[commits.length - 1].hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commits.length]);

  const { data: diff, isFetching } = useQuery({
    queryKey: ["diff", id, from, to],
    queryFn: () => api.diff(id!, from, to),
    enabled:
      !!id &&
      /^0x[0-9a-f]{64}$/i.test(from) &&
      /^0x[0-9a-f]{64}$/i.test(to) &&
      from !== to
  });

  return (
    <div className="space-y-10">
      <header className="border-b border-line pb-8">
        <div className="eyebrow mb-2">// delta</div>
        <h1 className="display text-4xl md:text-5xl text-fg">Diff</h1>
        <p className="text-muted text-sm mt-2 max-w-md">
          Compare what the agent learned, forgot, or rewrote between two points in its chain.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <Picker label="from" value={from} setValue={setFrom} options={commits} />
        <Picker label="to" value={to} setValue={setTo} options={commits} />
      </div>

      {isFetching && (
        <div
          className="text-center py-8 text-[11px] uppercase tracking-widest2 text-muted"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          // computing diff…
        </div>
      )}

      {diff && (
        <div className="space-y-10">
          <section className="grid grid-cols-2 md:grid-cols-4 divide-x divide-line border-y border-line">
            <Counter label="added" count={diff.added.length} accent />
            <Counter label="removed" count={diff.removed.length} />
            <Counter label="modified" count={diff.modified.length} />
            <Counter label="unchanged" count={diff.unchanged} muted />
          </section>

          <section className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-4">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] uppercase tracking-widest2 text-muted"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                from
              </span>
              <Hash value={from} />
            </div>
            <span className="text-muted2">→</span>
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] uppercase tracking-widest2 accent-text"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                to
              </span>
              <Hash value={to} />
            </div>
          </section>

          <DiffSection title="Added" items={diff.added} />
          <DiffSection title="Removed" items={diff.removed} />
          <DiffSection title="Modified" items={diff.modified} />

          {diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && (
            <div className="text-center py-12 text-muted text-sm">
              No structural changes between these commits.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Picker({
  label,
  value,
  setValue,
  options
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  options: { hash: string; message: string }[];
}) {
  return (
    <div>
      <label className="label">{label} commit</label>
      <select className="input input-mono" value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">— pick —</option>
        {options.map((o) => (
          <option key={o.hash} value={o.hash}>
            {o.hash.slice(0, 10)}… — {o.message}
          </option>
        ))}
      </select>
    </div>
  );
}

function Counter({
  label,
  count,
  accent,
  muted
}: {
  label: string;
  count: number;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div
        className="display text-3xl md:text-5xl"
        style={{ color: accent ? "#FF4D00" : muted ? "#505050" : "#E8E8E8" }}
      >
        <AnimatedCounter to={count} />
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-widest2 text-muted2">{label}</div>
    </div>
  );
}

function DiffSection({
  title,
  items
}: {
  title: string;
  items: Array<{ id: string; type: string; fromSha?: string; toSha?: string }>;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <span
          className="text-[10px] uppercase tracking-widest2 text-muted"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          // {title}
        </span>
        <span className="text-muted2 text-xs">{items.length}</span>
      </div>
      <ul className="border-y border-line divide-y divide-line">
        {items.map((it, i) => (
          <li
            key={`${it.id}-${i}`}
            className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-2 py-4"
          >
            <TypeIcon type={it.type} />
            <div className="min-w-0">
              <div
                className="text-fg text-sm truncate"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {it.id}
              </div>
              <div
                className="text-[10px] uppercase tracking-widest2 text-muted2 mt-0.5"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {it.type}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[11px]">
              {it.fromSha && (
                <>
                  <Hash value={it.fromSha} />
                  {it.toSha && <span className="text-muted2">→</span>}
                </>
              )}
              {it.toSha && <Hash value={it.toSha} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
