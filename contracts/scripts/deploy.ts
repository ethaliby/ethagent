import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const ORACLE_ADDR =
    process.env.ORACLE_ADDRESS ||
    // Default deterministic mock oracle (anvil/hardhat account #9 derivation).
    "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} native`);
  console.log(`Oracle: ${ORACLE_ADDR}`);

  const Factory = await ethers.getContractFactory("AgentINFT");
  const c = await Factory.deploy(ORACLE_ADDR);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  const tx = c.deploymentTransaction()!;
  const rcpt = await tx.wait();
  const block = rcpt!.blockNumber;

  console.log(`AgentINFT deployed to: ${addr}`);
  console.log(`Block: ${block}`);
  console.log(`Tx: ${tx.hash}`);

  // Persist for backend / frontend to consume.
  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    contractAddress: addr,
    deployer: deployer.address,
    oracleAddress: ORACLE_ADDR,
    txHash: tx.hash,
    block,
    deployedAt: new Date().toISOString()
  };
  const outDir = path.join(__dirname, "..", "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${network.name}.json`),
    JSON.stringify(out, null, 2)
  );
  console.log(`Deployment saved to deployments/${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
