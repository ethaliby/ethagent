import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import { wagmiConfig } from "./lib/wagmi";
import { Layout } from "./components/Layout";
import { WalletGuard } from "./components/WalletGuard";
import { Splash } from "./pages/Splash";
import { Landing } from "./pages/Landing";
import { CreateAgent } from "./pages/CreateAgent";
import { AgentProfile } from "./pages/AgentProfile";
import { CommitPage } from "./pages/Commit";
import { DiffPage } from "./pages/Diff";
import { ForkPage } from "./pages/Fork";
import { ChatPage } from "./pages/Chat";
import { VerifyPage } from "./pages/Verify";
import { ExplorePage } from "./pages/Explore";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#5168ff" })}>
          <BrowserRouter>
            <Routes>
              {/* Full-bleed splash — no Layout chrome */}
              <Route path="/" element={<Splash />} />

              {/* Public app routes (verify, explore) — no wallet required, but Layout */}
              <Route element={<Layout />}>
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/verify" element={<VerifyPage />} />
              </Route>

              {/* Wallet-gated app routes */}
              <Route element={<WalletGuard />}>
                <Route element={<Layout />}>
                  <Route path="/app" element={<Landing />} />
                  <Route path="/agents/new" element={<CreateAgent />} />
                  <Route path="/agents/:id" element={<AgentProfile />} />
                  <Route path="/agents/:id/commit" element={<CommitPage />} />
                  <Route path="/agents/:id/diff" element={<DiffPage />} />
                  <Route path="/agents/:id/fork" element={<ForkPage />} />
                  <Route path="/agents/:id/chat" element={<ChatPage />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
