import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });
dotenv.config();

const ZEROG_RPC = process.env.ZEROG_CHAIN_RPC || "https://evmrpc-testnet.0g.ai";
const ZEROG_CHAIN_ID = Number(process.env.ZEROG_CHAIN_ID || 16601);
const RAW_KEY = (process.env.ZEROG_PRIVATE_KEY || "").trim();
// Only treat the env var as a real key if it looks like a 0x + 64-hex string.
const VALID_KEY = /^0x[0-9a-fA-F]{64}$/.test(RAW_KEY);
const ZEROG_PRIVATE_KEY = VALID_KEY ? RAW_KEY : "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: false
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    zerog: {
      url: ZEROG_RPC,
      chainId: ZEROG_CHAIN_ID,
      accounts: ZEROG_PRIVATE_KEY ? [ZEROG_PRIVATE_KEY] : []
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

export default config;
