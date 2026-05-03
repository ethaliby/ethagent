import { useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected?: (address: `0x${string}`) => void;
}

export function WalletConnectModal({ open, onClose, onConnected }: Props) {
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && isConnected && address) {
      onConnected?.(address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isConnected, address]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wc-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(11, 11, 11, 0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md border border-line2 bg-bg p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent bar — Sirius 2.0 marker */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "#FF4D00" }} />

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 inline-flex h-7 w-7 items-center justify-center text-muted hover:text-fg transition"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-7">
          <div className="eyebrow mb-2">// authenticate</div>
          <h2 id="wc-title" className="display text-2xl text-fg mb-1">
            Connect wallet
          </h2>
          <p className="text-sm text-muted">
            Required to mint, commit, and own your agents on chain.
          </p>
        </div>

        {/* Connect — RainbowKit themed */}
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
            const ready = mounted;
            const connected = ready && account && chain;

            if (!ready) {
              return (
                <button className="btn btn-primary w-full text-base py-3.5" disabled>
                  Loading…
                </button>
              );
            }

            if (!connected) {
              return (
                <button
                  onClick={openConnectModal}
                  className="btn btn-accent w-full text-base py-3.5"
                >
                  Connect wallet
                  <Arrow />
                </button>
              );
            }

            if (chain.unsupported) {
              return (
                <button
                  onClick={openChainModal}
                  className="btn w-full text-base py-3.5 border border-bad/60 text-bad"
                >
                  Wrong network — switch
                </button>
              );
            }

            return (
              <div className="space-y-3">
                <div className="flex items-center gap-3 border border-line2 bg-surface px-4 py-3">
                  <span className="h-9 w-9 border border-line2 bg-bg flex items-center justify-center accent-text">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="3" fill="currentColor" />
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm text-fg truncate">
                      {account.displayName}
                    </div>
                    <div
                      className="font-mono text-[10px] text-muted2 uppercase tracking-widest2 mt-0.5"
                    >
                      {chain.name}
                    </div>
                  </div>
                  <button
                    onClick={openAccountModal}
                    className="text-[10px] uppercase tracking-widest2 text-muted hover:text-fg transition"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    manage
                  </button>
                </div>
                <button
                  onClick={() => onConnected?.(account.address as `0x${string}`)}
                  className="btn btn-accent w-full text-base py-3.5"
                >
                  Enter dashboard
                  <Arrow />
                </button>
              </div>
            );
          }}
        </ConnectButton.Custom>

        {/* Trust line */}
        <div className="mt-7 pt-5 border-t border-line grid grid-cols-3 gap-2 text-center">
          <Trust label="0G testnet" />
          <Trust label="ENS sepolia" />
          <Trust label="ERC-7857" />
        </div>

        <p
          className="mt-4 text-center text-[10px] uppercase tracking-widest2 text-muted2"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          Sirius never holds your keys
        </p>
      </div>
    </div>
  );
}

function Trust({ label }: { label: string }) {
  return (
    <div
      className="text-[10px] uppercase tracking-widest2 text-muted"
      style={{ fontFamily: "JetBrains Mono, monospace" }}
    >
      <div className="h-1 w-1 rounded-full mx-auto mb-1.5" style={{ background: "#FF4D00" }} />
      {label}
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
