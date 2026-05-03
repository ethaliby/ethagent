import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";

/**
 * WalletGuard — gates app routes behind a connected wallet.
 * If the user is disconnected, redirects to "/?connect=1" so the splash auto-opens
 * the wallet modal. After connection, the user lands back on the original route via
 * the splash's onConnected handler (which routes to /app by default).
 */
export function WalletGuard() {
  const { isConnected, status } = useAccount();
  const navigate = useNavigate();

  useEffect(() => {
    // wagmi status: "connecting" | "reconnecting" | "connected" | "disconnected"
    // Only redirect once we're sure (avoid race with hydration on hard refresh).
    if (status === "disconnected") {
      navigate("/?connect=1", { replace: true });
    }
  }, [status, navigate]);

  if (!isConnected) {
    // Render nothing during connect/reconnect; avoids flashing the app shell.
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div
          className="text-[11px] uppercase tracking-widest2 text-muted2"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          checking wallet…
        </div>
      </div>
    );
  }

  return <Outlet />;
}
