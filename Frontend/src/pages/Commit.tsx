import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, MemoryEntryInput } from "../lib/api";
import { TypeIcon } from "../components/TypeIcon";

interface RowEntry {
  id: string;
  type: MemoryEntryInput["type"];
  content: string;
  tags: string;
}

const blank = (): RowEntry => ({
  id: Math.random().toString(36).slice(2, 9),
  type: "memory_chunk",
  content: "",
  tags: ""
});

const TYPES: Array<{ v: MemoryEntryInput["type"]; label: string }> = [
  { v: "memory_chunk", label: "memory" },
  { v: "persona_delta", label: "persona" },
  { v: "skill", label: "skill" }
];

export function CommitPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<RowEntry[]>([blank()]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const update = (i: number, patch: Partial<RowEntry>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const validCount = rows.filter((r) => r.content.trim()).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const entries: MemoryEntryInput[] = rows
      .filter((r) => r.content.trim())
      .map((r) => ({
        type: r.type,
        content: r.content,
        tags: r.tags.split(",").map((t) => t.trim()).filter(Boolean)
      }));
    if (!entries.length) return setErr("Add at least one entry with content.");
    if (!message.trim()) return setErr("Commit message is required.");
    setSubmitting(true);
    setErr(null);
    try {
      await api.commit(id, { message, entries });
      nav(`/agents/${id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="border-b border-line pb-8 mb-10">
        <div className="eyebrow mb-2">// commit</div>
        <h1 className="display text-4xl md:text-5xl text-fg">Commit memory</h1>
        <p className="text-muted text-sm mt-2 max-w-xl">
          Each entry is encrypted with XChaCha20-Poly1305, uploaded to 0G Storage,
          then anchored on chain via the manifest's Merkle root.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-10">
        <div>
          <label className="label">commit message</label>
          <input
            className="input text-base"
            placeholder="session 18 — learned RAG over PDFs"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <label className="label !mb-0">entries</label>
            <span
              className="text-[10px] uppercase tracking-widest2 text-muted2"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {validCount} ready · {rows.length} total
            </span>
          </div>

          <ul className="border-y border-line divide-y divide-line">
            {rows.map((r, i) => (
              <li key={r.id} className="py-5 px-2 group">
                <div className="flex items-start gap-4">
                  <span className="num text-2xl shrink-0 w-8 mt-1">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <TypeIcon type={r.type} className="mt-1 shrink-0" />
                  <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {TYPES.map((t) => (
                        <button
                          key={t.v}
                          type="button"
                          onClick={() => update(i, { type: t.v })}
                          className={`px-3 py-1 text-[11px] uppercase tracking-widest2 border transition ${
                            r.type === t.v
                              ? "text-fg border-fg"
                              : "text-muted border-line2 hover:text-fg"
                          }`}
                          style={{ fontFamily: "JetBrains Mono, monospace" }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="input min-h-[80px] resize-none"
                      placeholder="What did the agent learn?"
                      value={r.content}
                      onChange={(e) => update(i, { content: e.target.value })}
                    />
                    <input
                      className="input input-mono"
                      placeholder="tags · preference, topic:ml"
                      value={r.tags}
                      onChange={(e) => update(i, { tags: e.target.value })}
                    />
                  </div>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      title="Remove"
                      className="opacity-0 group-hover:opacity-100 transition shrink-0 h-8 w-8 border border-line2 hover:border-bad/60 hover:text-bad text-muted flex items-center justify-center"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, blank()])}
            className="w-full mt-3 py-3 border border-dashed border-line2 hover:border-fg text-muted hover:text-fg transition text-sm uppercase tracking-widest2"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            + add entry
          </button>
        </div>

        {err && <div className="border border-bad/30 bg-bad/5 text-bad p-3 text-sm">{err}</div>}

        <div className="border-t border-line pt-6">
          <button
            className="btn btn-accent w-full text-base py-3.5"
            disabled={submitting || validCount === 0 || !message.trim()}
          >
            {submitting
              ? "Encrypting · uploading · anchoring…"
              : `Commit ${validCount} ${validCount === 1 ? "entry" : "entries"}`}
            <Arrow />
          </button>
        </div>
      </form>
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
