interface Props {
  type: string;
  className?: string;
}

const map: Record<string, JSX.Element> = {
  memory_chunk: (
    <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  ),
  persona_delta: (
    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  skill: (
    <>
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </>
  )
};

export function TypeIcon({ type, className = "" }: Props) {
  const glyph = map[type] ?? map.memory_chunk;
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-line2 bg-surface text-fg ${className}`}
      title={type}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        {glyph}
      </svg>
    </span>
  );
}
