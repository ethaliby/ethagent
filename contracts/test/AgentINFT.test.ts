import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentINFT } from "../typechain-types";

const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

function h(seed: string): `0x${string}` {
  return ethers.keccak256(ethers.toUtf8Bytes(seed)) as `0x${string}`;
}

describe("AgentINFT", function () {
  async function deploy() {
    const [deployer, alice, bob, oracle] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AgentINFT");
    const c = (await Factory.deploy(oracle.address)) as unknown as AgentINFT;
    await c.waitForDeployment();
    return { c, deployer, alice, bob, oracle };
  }

  it("mints a fresh agent with empty head", async () => {
    const { c, alice } = await deploy();
    const seal = h("seal-1");
    const tx = await c.connect(alice).mintAgent(alice.address, seal);
    await tx.wait();
    expect(await c.ownerOf(1)).to.equal(alice.address);
    expect(await c.getHead(1)).to.equal(ZERO);
    const repo = await c.repositories(1);
    expect(repo.rmkSealId).to.equal(seal);
    expect(repo.parentTokenId).to.equal(0n);
  });

  it("appends 3 commits in a chain (happy path)", async () => {
    const { c, alice } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("seal-2"));

    const c1 = h("commit-1");
    await c.connect(alice).commit(1, c1, ZERO, h("manifest-1"), h("merkle-1"), "session 1");
    expect(await c.getHead(1)).to.equal(c1);

    const c2 = h("commit-2");
    await c.connect(alice).commit(1, c2, c1, h("manifest-2"), h("merkle-2"), "session 2");
    expect(await c.getHead(1)).to.equal(c2);

    const c3 = h("commit-3");
    await c.connect(alice).commit(1, c3, c2, h("manifest-3"), h("merkle-3"), "session 3");
    expect(await c.getHead(1)).to.equal(c3);

    const stored = await c.getCommit(1, c2);
    expect(stored.parent).to.equal(c1);
    expect(stored.message).to.equal("session 2");
  });

  it("reverts when committing with wrong parent (anti-fork)", async () => {
    const { c, alice } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("seal-3"));
    const c1 = h("a-1");
    await c.connect(alice).commit(1, c1, ZERO, h("m-1"), h("r-1"), "ok");

    await expect(
      c.connect(alice).commit(1, h("a-2"), h("wrong-parent"), h("m-2"), h("r-2"), "bad")
    ).to.be.revertedWithCustomError(c, "AntiForkViolation");
  });

  it("reverts when non-owner attempts to commit", async () => {
    const { c, alice, bob } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("s"));
    await expect(
      c.connect(bob).commit(1, h("c"), ZERO, h("m"), h("r"), "x")
    ).to.be.revertedWithCustomError(c, "NotTokenOwner");
  });

  it("reverts when committing same hash twice", async () => {
    const { c, alice } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("s"));
    const c1 = h("c1");
    await c.connect(alice).commit(1, c1, ZERO, h("m"), h("r"), "first");
    // parent == head (c1), but commit hash already exists, so it's a duplicate.
    await expect(
      c.connect(alice).commit(1, c1, c1, h("m2"), h("r2"), "dupe")
    ).to.be.revertedWithCustomError(c, "CommitAlreadyExists");
  });

  it("forks at commit 2 and verifies lineage", async () => {
    const { c, alice, bob } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("s"));
    const c1 = h("c-1");
    const c2 = h("c-2");
    const c3 = h("c-3");
    await c.connect(alice).commit(1, c1, ZERO, h("m1"), h("r1"), "1");
    await c.connect(alice).commit(1, c2, c1, h("m2"), h("r2"), "2");
    await c.connect(alice).commit(1, c3, c2, h("m3"), h("r3"), "3");

    const tx = await c.connect(alice).forkAgent(1, c2, h("seal-child"), bob.address);
    const rcpt = await tx.wait();
    expect(rcpt!.status).to.equal(1);

    expect(await c.ownerOf(2)).to.equal(bob.address);
    const childRepo = await c.repositories(2);
    expect(childRepo.head).to.equal(c2);
    expect(childRepo.parentTokenId).to.equal(1n);
    expect(childRepo.parentCommit).to.equal(c2);

    const lineage = await c.getLineage(2);
    expect(lineage.map(String)).to.deep.equal(["1"]);
  });

  it("rejects fork at non-existent commit", async () => {
    const { c, alice, bob } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("s"));
    await expect(
      c.connect(alice).forkAgent(1, h("nope"), h("ns"), bob.address)
    ).to.be.revertedWithCustomError(c, "CommitNotFound");
  });

  it("attestReseal verifies oracle signature", async () => {
    const { c, alice, oracle } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("s"));

    const tokenId = 1n;
    const newSeal = h("new-seal");
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "address", "uint256", "address", "bytes32"],
        [chainId, await c.getAddress(), tokenId, alice.address, newSeal]
      )
    );
    const sig = await oracle.signMessage(ethers.getBytes(digest));

    await c.attestReseal(tokenId, newSeal, sig);
    const repo = await c.repositories(tokenId);
    expect(repo.rmkSealId).to.equal(newSeal);
  });

  it("rejects attestReseal with bad signature", async () => {
    const { c, alice, bob } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("s"));
    const newSeal = h("new-seal");
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "address", "uint256", "address", "bytes32"],
        [chainId, await c.getAddress(), 1n, alice.address, newSeal]
      )
    );
    const badSig = await bob.signMessage(ethers.getBytes(digest));
    await expect(c.attestReseal(1n, newSeal, badSig)).to.be.revertedWithCustomError(
      c,
      "InvalidOracleSignature"
    );
  });

  it("supports EIP-2981 royalty (5%)", async () => {
    const { c, alice } = await deploy();
    await c.connect(alice).mintAgent(alice.address, h("s"));
    const [receiver, amount] = await c.royaltyInfo(1, 10_000n);
    expect(receiver).to.equal(alice.address);
    expect(amount).to.equal(500n); // 5% of 10000
  });
});
