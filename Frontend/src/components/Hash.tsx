import { useState } from "react";

interface Props {
  value: string | null | undefined;
  short?: boolean;
  className?: string;
}

export function Hash({ value, short = true, className = "" }: Props) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted2">—</span>;
  const display = short ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;

  function copy() {
    navigator.clipboard
      .writeText(value!)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1100);
      })
      .catch(() => undefined);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : value}
      className={`pill group ${className}`}
    >
      <span className={copied ? "accent-text" : ""}>{display}</span>
      {copied ? (
        <svg viewBox="0 0 24 24" className="h-3 w-3 accent-text" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3 w-3 opacity-50 group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}
