/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_ZEROG_RPC?: string;
  readonly VITE_ZEROG_CHAIN_ID?: string;
  readonly VITE_AGENT_INFT_ADDRESS?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_ENS_PARENT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
