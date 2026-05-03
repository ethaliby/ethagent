import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, VerifyResult } from "../lib/api";
import { Hash } from "../components/Hash";

export function VerifyPage() {
  const [params] = useSearchParams();
  const [name, setName] = useState(params.get("name") ?? "");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  async function go() {
    if (!name.trim()) return;
    setScanning(true);
    setErr(null);
    setResult(null);
    try {
      const [r] = await Promise.all([
        api.verifyEns(name.trim()),
        new Promise((res) => setTimeout(res, 900))
      ]);
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="border-b border-line pb-8 mb-10">
        <div className="eyebrow mb-2">// verify · no rpc</div>
        <h1 className="display text-4xl md:text-6xl text-fg text-balance">
          Verify any agent <br />
          <span style={{ color: "#FF4D00" }}>without ever calling 0G.</span>
        </h1>
        <p className="text-muted text-sm mt-3 max-w-xl">
          Resolve an ENS name. Fetch the manifest. Recompute the Merkle root locally.
          Compare to what ENS advertises.
        </p>
      </header>

      {/* Input */}
      <div className="flex items-stretch gap-2 border border-line2 p-1 mb-8">
        <span className="px-3 flex items-center text-muted">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.5-4.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className="flex-1 bg-transparent border-0 px-1 py-3 text-fg placeholder-muted2 focus:outline-none input-mono"
          placeholder="aria.siriusagents.eth"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !scanning && go()}
        />
        <button className="btn btn-accent !rounded-none" disabled={scanning || !name.trim()} onClick={go}>
          {scanning ? "Scanning…" : "Verify"}
        </button>
      </div>

      {/* Scanning panel */}
      {scanning && (
        <div className="relative border border-line p-6 overflow-hidden">
          <div
            className="text-[10px] uppercase tracking-widest2 mb-4"
            style={{ color: "#FF4D00", fontFamily: "JetBrains Mono, monospace" }}
          >
            scanning ens records · no rpc
          </div>
          <ScanLine label="resolving sirius.head" delay={0} />
          <ScanLine label="resolving sirius.merkle" delay={200} />
          <ScanLine label="fetching manifest from 0g storage" delay={400} />
          <ScanLine label="recomputing merkle locally" delay={600} />
        </div>
      )}

      {err && <div className="border border-bad/30 bg-bad/5 text-bad p-3 text-sm">{err}</div>}

      {result && !scanning && (
        <div className="space-y-6">
          {/* Verdict */}
          <div
            className={`border-2 p-8 flex items-center gap-5 ${
              result.verified ? "" : "border-bad/40"
            }`}
            style={result.verified ? { borderColor: "#FF4D00" } : {}}
          >
            <span
              className="h-16 w-16 shrink-0 border-2 flex items-center justify-center"
              style={
                result.verified
                  ? { borderColor: "#FF4D00", color: "#FF4D00" }
                  : { borderColor: "#F87171", color: "#F87171" }
              }
            >
              {result.verified ? (
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <div className="flex-1">
              <div
                className="display text-2xl md:text-3xl"
                style={result.verified ? { color: "#FF4D00" } : { color: "#F87171" }}
              >
                {result.verified ? "Verified" : "Not verified"}
              </div>
              <p className="text-sm text-muted mt-1">{result.reason}</p>
              {!result.live && (
                <span
                  className="inline-block mt-2 text-[10px] uppercase tracking-widest2 px-2 py-0.5 border border-line2 text-muted"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  mock ens · live mode requires acquired ens name
                </span>
              )}
            </div>
          </div>

          {/* Field cards */}
          <div className="grid md:grid-cols-2 gap-6">
            <FieldCard
              title="from ENS"
              rows={[
                ["ens name", result.ensName],
                ["token id", result.resolved?.tokenId ?? "—"],
                ["head", <Hash key="h" value={result.resolved?.head} short={false} />],
                ["merkle", <Hash key="m" value={result.resolved?.merkleRoot} short={false} />]
              ]}
            />
            <FieldCard
              title="computed locally"
              rows={[
                ["manifest blob", <Hash key="b" value={result.manifestUri} short={false} />],
                ["merkle (recomputed)", <Hash key="cm" value={result.computedMerkle} short={false} />],
                ["sha256 (manifest)", <Hash key="lh" value={result.manifestHashLocally} short={false} />]
              ]}
            />
          </div>

          <div
            className="text-xs text-muted leading-relaxed border-t border-line pt-4"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            <span style={{ color: "#FF4D00" }}>// the headline:</span> ENS gave us HEAD + Merkle.
            We fetched the manifest from 0G Storage, recomputed the Merkle locally, and compared.{" "}
            <strong className="text-fg">No 0G RPC was called.</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function ScanLine({ label, delay }: { label: string; delay: number }) {
  return (
    <div
      className="flex items-center gap-3 mb-1.5 text-[11px] uppercase tracking-widest2 text-muted"
      style={{
        fontFamily: "JetBrains Mono, monospace",
        animation: `fade-up 0.6s ${delay}ms ease-out both`
      }}
    >
      <span className="h-1 w-1 rounded-full animate-pulse2" style={{ background: "#FF4D00" }} />
      <span>{label}</span>
      <span className="flex-1 h-px bg-line2" />
    </div>
  );
}

function FieldCard({ title, rows }: { title: string; rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="border border-line p-5">
      <h3
        className="text-[10px] uppercase tracking-widest2 text-muted mb-4"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        // {title}
      </h3>
      <dl className="space-y-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-3 items-center">
            <dt
              className="text-[10px] uppercase tracking-widest2 text-muted2"
              style={{ fontFamily: "JetBrains Mono, monospace" }}
            >
              {k}
            </dt>
            <dd className="text-fg text-xs text-right truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
