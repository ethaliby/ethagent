import { defineChain } from "viem";
import { http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

const ZEROG_RPC = import.meta.env.VITE_ZEROG_RPC || "http://127.0.0.1:8545";
const ZEROG_CHAIN_ID = Number(import.meta.env.VITE_ZEROG_CHAIN_ID || 31337);

export const zerogChain = defineChain({
  id: ZEROG_CHAIN_ID,
  name: ZEROG_CHAIN_ID === 16601 ? "0G Galileo Testnet" : `dev (${ZEROG_CHAIN_ID})`,
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ZEROG_RPC] } },
  blockExplorers:
    ZEROG_CHAIN_ID === 16601
      ? { default: { name: "0G Chainscan", url: "https://chainscan-galileo.0g.ai" } }
      : undefined
});

export const wagmiConfig = getDefaultConfig({
  appName: "Sirius for Agents",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo-project-id",
  chains: [zerogChain],
  transports: {
    [zerogChain.id]: http(ZEROG_RPC)
  },
  ssr: false
});

export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) || "http://127.0.0.1:3001";

export const AGENT_INFT_ADDRESS =
  (import.meta.env.VITE_AGENT_INFT_ADDRESS as string | undefined) ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";
