import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAccount } from "wagmi";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { WalletConnectModal } from "../components/WalletConnectModal";
import Blob from "../components/Blob";

gsap.registerPlugin(ScrollTrigger);

/**
 * Splash — Sirius for Agents.
 * Cinematic scroll-pinned hero (à la Sirius 2.0): the title scales up over 700vh
 * while a marquee runs along the bottom, then a "Launch app" button fades in.
 * Below the pin: a flowing SVG path with alternating commit-chain step cards,
 * 0G primitives, team avatars, footer.
 */

/* ────────────────────────── DATA ────────────────────────── */

const flowSteps = [
  {
    number: "01",
    title: "Mint",
    description:
      "Generate a 256-bit Root Master Key client-side. Seal it under the owner's policy. Mint an ERC-7857 iNFT carrying the seal.",
  },
  {
    number: "02",
    title: "Encrypt",
    description:
      "Each entry is encrypted client-side with XChaCha20-Poly1305. Per-entry FileKey derived from the RMK. Plaintext never touches the wire.",
  },
  {
    number: "03",
    title: "Manifest",
    description:
      "Entries land in a canonical JSON manifest (sorted, no whitespace). Manifest is uploaded to 0G Storage as a content-addressed blob.",
  },
  {
    number: "04",
    title: "Merkle",
    description:
      "SHA-256 leaves are paired upward into a Merkle root. The root is the integrity anchor — anyone can recompute and verify.",
  },
  {
    number: "05",
    title: "Anchor",
    description:
      "commit() lands on chain: parent + manifestUri + merkleRoot + message. Anti-fork enforced at the contract level. ~70k gas.",
  },
  {
    number: "06",
    title: "Identify",
    description:
      "ENS text records are auto-updated: sirius.head + sirius.merkle + sirius.repo. The agent now has a verifiable on-chain identity.",
  },
  {
    number: "07",
    title: "Verify",
    description:
      "Anyone resolves the ENS name, fetches the manifest, recomputes the Merkle locally. If it matches, state is verified — no 0G RPC required.",
  },
];

const primitives = [
  { tag: "ERC-7857", name: "iNFT", description: "Tokenized agent state, sealed metadata, secure transfer" },
  { tag: "EIP-2981", name: "Royalty", description: "5% royalty back to the original creator on every transfer" },
  { tag: "0G-Chain", name: "Anchor", description: "Commit chain with anti-fork enforced on chain" },
  { tag: "0G-Storage", name: "Blobs", description: "Encrypted ciphertexts + manifests, content-addressed" },
  { tag: "0G-Compute", name: "Sealed", description: "TEE-backed inference with Anthropic fallback" },
  { tag: "ENS", name: "Identity", description: "HEAD + Merkle root in text records — verify without RPC" },
];

/* ────────────────────────── FLOW PATH (SVG drawn on scroll) ────────────────────────── */

function FlowPath({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const pathRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!pathRef.current || !containerRef.current) return;
    const lines = pathRef.current.querySelectorAll(".flow-line");
    const triggers: ScrollTrigger[] = [];
    lines.forEach((line) => {
      const path = line as SVGPathElement;
      const length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
      const t = gsap.to(path, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current!,
          start: "top 100%",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });
      if (t.scrollTrigger) triggers.push(t.scrollTrigger);
    });
    return () => triggers.forEach((t) => t.kill());
  }, [containerRef]);

  const w = 1200;
  const h = 6000;
  const amp = 320;
  const cx = w / 2;

  const seededRandom = (seed: number) => {
    const x = Math.sin(seed * 9301 + 4927) * 49297;
    return x - Math.floor(x);
  };

  const buildSinePath = (offset: number, jitterAmt: number) => {
    const points: string[] = [];
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = t * h;
      const jitter = (seededRandom(i * 31 + offset * 7) - 0.5) * jitterAmt;
      const x = cx + Math.sin(t * Math.PI * 7) * amp + offset + jitter;
      points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    }
    return points.join(" ");
  };

  const lines = [
    { offset: -24, opacity: 0.10, width: 1.5, jitter: 6 },
    { offset: -12, opacity: 0.16, width: 2, jitter: 4 },
    { offset: 0, opacity: 0.24, width: 2.5, jitter: 3 },
    { offset: 12, opacity: 0.16, width: 2, jitter: 5 },
    { offset: 24, opacity: 0.10, width: 1.5, jitter: 7 },
  ];

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        maskImage:
          "linear-gradient(to bottom, transparent 0%, white 18%, white 58%, transparent 72%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, white 18%, white 58%, transparent 72%)",
      }}
    >
      <svg
        ref={pathRef}
        viewBox={`0 0 ${w} ${h}`}
        className="h-full w-full"
        preserveAspectRatio="none"
        fill="none"
      >
        {lines.map((l, i) => (
          <path
            key={i}
            className="flow-line"
            d={buildSinePath(l.offset, l.jitter)}
            stroke={`rgba(255,255,255,${l.opacity})`}
            strokeWidth={l.width}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}

/* ────────────────────────── FLOW SECTION ────────────────────────── */

function FlowSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const ts: ScrollTrigger[] = [];
    cardsRef.current.forEach((card, i) => {
      if (!card) return;
      const fromX = i % 2 === 0 ? -80 : 80;
      const t = gsap.fromTo(
        card,
        { opacity: 0, x: fromX },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: card,
            start: "top 85%",
            end: "top 55%",
            toggleActions: "play none none reverse",
          },
        }
      );
      if (t.scrollTrigger) ts.push(t.scrollTrigger);
    });
    return () => ts.forEach((t) => t.kill());
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative z-10 overflow-hidden px-6 py-24 md:px-12 md:py-32"
    >
      <h2 className="font-display-vip mb-4 text-center text-4xl tracking-wider text-[#e8e8e8] md:text-5xl">
        How it works
      </h2>
      <p className="mx-auto mb-20 max-w-lg text-center text-sm tracking-wide text-[#888] md:mb-28 md:text-base">
        Seven steps from raw memory to verifiable on-chain state
      </p>

      <div className="relative mx-auto max-w-5xl">
        <div className="relative flex flex-col gap-16 md:gap-24">
          {flowSteps.map((step, i) => {
            const isLeft = i % 2 === 0;
            return (
              <div
                key={step.number}
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
                className={`flex ${
                  isLeft ? "md:justify-start" : "md:justify-end"
                } justify-center`}
              >
                <div className="group relative w-full max-w-md rounded-2xl border border-[#1e1e1e] bg-[#131313]/60 p-6 backdrop-blur-md transition-colors hover:border-[#505050]/60 md:p-8">
                  <div className="mb-3 flex items-center gap-4">
                    <span className="font-display-vip text-3xl tracking-wider text-[#888] md:text-4xl">
                      {step.number}
                    </span>
                    <span className="font-display-vip text-xl tracking-wider text-[#e8e8e8] md:text-2xl">
                      {step.title}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#888] md:text-base">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primitives */}
      <div className="mx-auto mt-32 max-w-4xl md:mt-40">
        <h3 className="font-display-vip mb-12 text-center text-3xl tracking-wider text-[#e8e8e8] md:text-4xl">
          Built on 0G + ENS
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {primitives.map((p) => (
            <div
              key={p.tag}
              className="rounded-xl border border-[#1e1e1e] bg-[#131313]/40 p-5 backdrop-blur-sm transition-colors hover:border-[#505050]/40"
            >
              <span className="mb-1 block text-xs font-medium tracking-widest text-[#888]">
                {p.tag}
              </span>
              <span className="font-display-vip mb-2 block text-lg tracking-wider text-[#e8e8e8]">
                {p.name}
              </span>
              <p className="text-sm leading-relaxed text-[#888]">{p.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────── MARQUEE ────────────────────────── */

const marqueeItems = ["Sirius for Agents", "Versioned state on chain", "Built on 0G + ENS"];

const MarqueeContent = () => (
  <>
    {Array.from({ length: 6 }).map((_, i) =>
      marqueeItems.map((item, j) => (
        <span key={`${i}-${j}`} className="flex items-center">
          <span>{item}</span>
          <span className="mx-8 inline-block h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ))
    )}
  </>
);

/* ────────────────────────── SOCIAL ICONS ────────────────────────── */

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

/* ────────────────────────── AVATAR (flip) ────────────────────────── */

function AvatarCard({
  name,
  initial,
  x = "#",
  linkedin = "#",
  github = "#",
}: {
  name: string;
  initial: string;
  x?: string;
  linkedin?: string;
  github?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setFlipped(false), 250);
  };
  const handleMouseEnter = () => {
    clearTimer();
    setFlipped(true);
  };

  useEffect(() => () => clearTimer(), []);

  return (
    <div className="flex flex-col items-center">
      <div
        className="h-[250px] w-[250px] cursor-pointer md:h-[300px] md:w-[300px] lg:h-[350px] lg:w-[350px]"
        style={{ perspective: "1000px" }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="relative h-full w-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front — gradient initial */}
          <div
            className="absolute inset-0 overflow-hidden rounded-full"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div
              className="flex h-full w-full items-center justify-center font-display-vip text-7xl md:text-8xl"
              style={{
                background: "#131313",
                color: "#FF4D00",
                border: "1px solid #2A2A2A"
              }}
            >
              {initial}
            </div>
          </div>
          {/* Back — socials */}
          <div
            className="absolute inset-0 overflow-hidden rounded-full"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <div
              className="flex h-full w-full items-center justify-center font-display-vip text-7xl md:text-8xl"
              style={{
                background: "#0B0B0B",
                color: "#1A1A1A",
                transform: "scaleX(-1)"
              }}
            >
              {initial}
            </div>
            <div className="absolute inset-0 flex items-center justify-center gap-8 bg-black/70">
              <a
                href={x}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white transition-all hover:scale-125"
                onClick={(e) => e.stopPropagation()}
              >
                <XIcon />
              </a>
              <a
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white transition-all hover:scale-125"
                onClick={(e) => e.stopPropagation()}
              >
                <LinkedInIcon />
              </a>
              <a
                href={github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white transition-all hover:scale-125"
                onClick={(e) => e.stopPropagation()}
              >
                <GitHubIcon />
              </a>
            </div>
          </div>
        </div>
      </div>
      <p className="font-display-vip mt-6 text-center text-xl tracking-wider text-[#e8e8e8] md:text-2xl">
        {name}
      </p>
    </div>
  );
}

/* ────────────────────────── PAGE BOTTOM (everything below the pinned hero) ────────────────────────── */

function PageBottom({ onLaunch }: { onLaunch: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      <FlowPath containerRef={containerRef} />
      <FlowSection />

      <section className="relative z-10 min-h-screen px-8 py-16 md:px-16 md:py-24">
        <div className="flex items-start justify-between">
          <h2 className="font-display-vip text-4xl tracking-wider text-[#e8e8e8] md:text-5xl">
            About us :
          </h2>
          <a
            href="https://ethglobal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#1e1e1e] bg-[#131313] text-[#e8e8e8] md:h-14 md:w-14">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
            </span>
            <span className="text-left text-sm leading-tight tracking-wider text-[#e8e8e8] md:text-base">
              ETHGlobal
              <br />
              Open Agents
            </span>
          </a>
        </div>

        <div className="mt-20 flex flex-col items-center justify-center gap-16 md:mt-28 md:flex-row md:gap-24 lg:gap-32">
          <AvatarCard
            name="Ali BEN YEZZA"
            initial="A"
            x="https://x.com"
            linkedin="https://www.linkedin.com/in/ali-ben-yezza/"
            github="https://github.com/alibenyezza"
          />
          <AvatarCard
            name="Rayan E."
            initial="R"
            x="https://x.com"
            linkedin="https://www.linkedin.com"
            github="https://github.com"
          />
        </div>
      </section>

      {/* CLIMAX CTA */}
      <section className="relative z-10 px-6 pb-32 md:px-12">
        <div className="mx-auto max-w-5xl rounded-2xl border border-[#1e1e1e] bg-[#0d0d10] p-10 md:p-16 text-center relative overflow-hidden">
          <div className="font-mono text-[10px] tracking-[0.3em] text-[#888] mb-3">// READY</div>
          <h2 className="font-display-vip text-3xl md:text-5xl text-[#e8e8e8] mb-5 text-balance">
            Ship state that <span style={{ color: "#FF4D00" }}>survives.</span>
          </h2>
          <p className="text-[#888] text-sm md:text-base max-w-xl mx-auto mb-8">
            Connect your wallet, mint your first agent, and start a verifiable commit chain.
            Free on testnet. Open source.
          </p>
          <button
            onClick={onLaunch}
            className="group relative inline-flex items-center gap-3 rounded-full border border-white/80 bg-white/5 px-10 py-4 text-lg tracking-wide text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white"
          >
            <span>Launch app</span>
            <svg
              viewBox="0 0 10 8"
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
              fill="currentColor"
            >
              <path d="M4.45231 0.385986H6.02531L9.30131 3.99999L6.02531 7.61399H4.45231L7.40331 4.58499H0.695312V3.42799H7.41631L4.45231 0.385986Z" />
            </svg>
          </button>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#1e1e1e] px-4 py-4 text-center">
        <p className="text-[10px] tracking-widest text-[#505050]">
          Built on 0G + ENS — ETHGlobal Open Agents 2026
        </p>
      </footer>
    </div>
  );
}

/* ────────────────────────── MAIN COMPONENT ────────────────────────── */

export function Splash() {
  const heroRef = useRef<HTMLDivElement>(null);
  const launchBtnRef = useRef<HTMLDivElement>(null);
  const uiOverlayRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isConnected } = useAccount();
  const [modalOpen, setModalOpen] = useState(false);

  // Open modal if redirected from a guarded route with ?connect=1
  useEffect(() => {
    if (params.get("connect") === "1") {
      setModalOpen(true);
      // Strip the param so reload doesn't re-open
      const next = new URLSearchParams(params);
      next.delete("connect");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLaunch = () => {
    if (isConnected) {
      navigate("/app");
    } else {
      setModalOpen(true);
    }
  };

  const onConnected = () => {
    setModalOpen(false);
    // small defer so the modal close animates before route change
    setTimeout(() => navigate("/app"), 120);
  };

  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;

    const lenis = new Lenis({
      duration: 1.4,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    lenis.stop();
    lenis.scrollTo(0, { immediate: true });
    lenis.start();

    lenis.on("scroll", ScrollTrigger.update);
    const rafFn = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(rafFn);
    gsap.ticker.lagSmoothing(0);

    // Shared scrollProgress global — read by Blob (Three.js camera)
    const scrollProgressRef = { current: 0 };
    (window as unknown as Record<string, unknown>).__scrollProgress = scrollProgressRef;

    const trigger = ScrollTrigger.create({
      trigger: heroRef.current!,
      start: "top top",
      end: "bottom bottom",
      pin: ".hero-pin",
      scrub: 0.8,
      onUpdate: (self) => {
        scrollProgressRef.current = self.progress;
        if (uiOverlayRef.current) {
          const raw = Math.min(1, Math.max(0, (self.progress - 0.03) / 0.77));
          const zoom = 1 + raw * raw * 8;
          uiOverlayRef.current.style.transform = `scale(${zoom})`;
        }
        if (launchBtnRef.current) {
          const btnProgress = Math.min(1, Math.max(0, (self.progress - 0.6) / 0.1));
          launchBtnRef.current.style.opacity = String(btnProgress);
          launchBtnRef.current.style.pointerEvents =
            self.progress >= 0.65 ? "auto" : "none";
        }
      },
    });

    return () => {
      lenis.stop();
      lenis.destroy();
      trigger.kill();
      ScrollTrigger.getAll().forEach((t) => t.kill());
      ScrollTrigger.clearScrollMemory();
      ScrollTrigger.refresh();
      gsap.ticker.remove(rafFn);
      document.querySelectorAll(".pin-spacer").forEach((el) => {
        const child = el.firstElementChild;
        if (child) el.parentNode?.replaceChild(child, el);
        else el.remove();
      });
      window.history.scrollRestoration = "auto";
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      delete (window as unknown as Record<string, unknown>).__scrollProgress;
    };
  }, []);

  return (
    <div className="splash-root">
      {/* Three.js organic blob — camera approaches as scrollProgress increases */}
      <Blob />

      <div ref={heroRef} className="relative h-[700vh]">
        <div className="hero-pin pointer-events-none relative h-screen w-screen overflow-hidden">
          {/* UI overlay: title + marquee */}
          <div
            ref={uiOverlayRef}
            className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between"
            style={{ transformOrigin: "center center" }}
          >
            <div className="flex items-start justify-between p-8 md:p-12">
              <h1 className="font-display-vip text-4xl tracking-wider text-[#e8e8e8] md:text-5xl">
                Sirius
              </h1>
              <span className="hidden md:block font-display-vip text-xs tracking-[0.3em] text-[#505050]">
                FOR AGENTS
              </span>
            </div>

            <div className="w-full">
              <div className="overflow-hidden bg-white py-0.5">
                <div
                  className="flex whitespace-nowrap text-xs uppercase tracking-wider text-[#0b0b0b] md:text-sm"
                  style={{ animation: "marquee 20s linear infinite" }}
                >
                  <span className="flex shrink-0 items-center">
                    <MarqueeContent />
                  </span>
                  <span className="flex shrink-0 items-center">
                    <MarqueeContent />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Launch button — fades in around 60% scroll */}
          <div
            ref={launchBtnRef}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            style={{ opacity: 0 }}
          >
            <button
              type="button"
              onClick={onLaunch}
              className="group relative inline-flex items-center gap-3 rounded-full border border-white/80 bg-white/5 px-10 py-4 text-lg tracking-wide text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white"
            >
              <span>Launch app</span>
              <svg
                viewBox="0 0 10 8"
                className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                fill="currentColor"
              >
                <path d="M4.45231 0.385986H6.02531L9.30131 3.99999L6.02531 7.61399H4.45231L7.40331 4.58499H0.695312V3.42799H7.41631L4.45231 0.385986Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <PageBottom onLaunch={onLaunch} />

      <WalletConnectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConnected={onConnected}
      />

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
