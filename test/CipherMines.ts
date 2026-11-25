import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { CipherMines, CipherMines__factory } from "../types";

const Risk = { Low: 0, Medium: 1, High: 2 } as const;
const Status = { None: 0, Active: 1, Settling: 2, Settled: 3 } as const;
const PTS = [1, 3, 6];

type Signers = { deployer: HardhatEthersSigner; alice: HardhatEthersSigner; bob: HardhatEthersSigner };

async function deployFixture() {
  const factory = (await ethers.getContractFactory("CipherMines")) as CipherMines__factory;
  const game = (await factory.deploy()) as CipherMines;
  return { game, address: await game.getAddress() };
}

/** Expected score for a path given the revealed board. */
function expectedScore(board: number, path: number[], risk: number): number {
  let score = 0;
  let alive = true;
  path.forEach((cell, i) => {
    const mine = ((board >>> cell) & 1) === 1;
    alive = alive && !mine;
    score = alive ? score + PTS[risk] * (i + 1) : 0;
  });
  return score;
}

describe("CipherMines", function () {
  let signers: Signers;
  let game: CipherMines;
  let address: string;

  before(async function () {
    const s = await ethers.getSigners();
    signers = { deployer: s[0], alice: s[1], bob: s[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This hardhat test suite runs only on the FHEVM mock environment");
      this.skip();
    }
    ({ game, address } = await deployFixture());
  });

  async function decryptLastHit(player: HardhatEthersSigner) {
    const h = await game.getHandles(player.address);
    return fhevm.userDecryptEbool(h.lastHit, address, player);
  }
  async function decryptScore(player: HardhatEthersSigner) {
    const h = await game.getHandles(player.address);
    return Number(await fhevm.userDecryptEuint(FhevmType.euint32, h.score, address, player));
  }
  async function decryptAlive(player: HardhatEthersSigner) {
    const h = await game.getHandles(player.address);
    return fhevm.userDecryptEbool(h.alive, address, player);
  }
  async function cashOutAndSettle(player: HardhatEthersSigner, settler = player) {
    await (await game.connect(player).cashOut()).wait();
    const h = await game.getHandles(player.address);
    const res = await fhevm.publicDecrypt([h.score, h.board]);
    await (await game.connect(settler).settle(player.address, res.abiEncodedClearValues, res.decryptionProof)).wait();
    return game.getRound(player.address);
  }

  it("starts with no round and an empty leaderboard", async function () {
    const r = await game.getRound(signers.alice.address);
    expect(r.status).to.eq(Status.None);
    expect(await game.getLeaderboard()).to.have.length(0);
    expect(await game.pointsPerStep(Risk.Low)).to.eq(1);
    expect(await game.pointsPerStep(Risk.Medium)).to.eq(3);
    expect(await game.pointsPerStep(Risk.High)).to.eq(6);
  });

  it("starts a round with an encrypted board and player-readable state", async function () {
    await expect(game.connect(signers.alice).startRound(Risk.Medium))
      .to.emit(game, "RoundStarted")
      .withArgs(signers.alice.address, 1, Risk.Medium);
    const r = await game.getRound(signers.alice.address);
    expect(r.status).to.eq(Status.Active);
    expect(r.risk).to.eq(Risk.Medium);
    const h = await game.getHandles(signers.alice.address);
    expect(h.board).to.not.eq(ethers.ZeroHash);
    expect(await decryptAlive(signers.alice)).to.eq(true);
    expect(await decryptScore(signers.alice)).to.eq(0);
  });

  it("keeps the mine map secret from the player during the round", async function () {
    await (await game.connect(signers.alice).startRound(Risk.Medium)).wait();
    const h = await game.getHandles(signers.alice.address);
    let failed = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint32, h.board, address, signers.alice);
    } catch {
      failed = true;
    }
    expect(failed, "player must not be able to decrypt the board").to.eq(true);
  });

  it("keeps a player's state secret from other players", async function () {
    await (await game.connect(signers.alice).startRound(Risk.Low)).wait();
    await (await game.connect(signers.alice).openCell(12)).wait();
    const h = await game.getHandles(signers.alice.address);
    let failed = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint32, h.score, address, signers.bob);
    } catch {
      failed = true;
    }
    expect(failed, "bob must not decrypt alice's score").to.eq(true);
  });

  it("rejects invalid moves", async function () {
    await expect(game.connect(signers.alice).openCell(0)).to.be.revertedWithCustomError(game, "RoundNotActive");
    await expect(game.connect(signers.alice).cashOut()).to.be.revertedWithCustomError(game, "RoundNotActive");
    await (await game.connect(signers.alice).startRound(Risk.Low)).wait();
    await expect(game.connect(signers.alice).cashOut()).to.be.revertedWithCustomError(game, "NothingOpened");
    await expect(game.connect(signers.alice).openCell(25)).to.be.revertedWithCustomError(game, "CellOutOfRange");
    await (await game.connect(signers.alice).openCell(3)).wait();
    await expect(game.connect(signers.alice).openCell(3)).to.be.revertedWithCustomError(game, "CellAlreadyOpened");
    await expect(game.connect(signers.bob).settle(signers.alice.address, "0x", "0x")).to.be.revertedWithCustomError(
      game,
      "RoundNotSettling",
    );
  });

  it("every step outcome matches the board revealed at settlement, and score follows the rules", async function () {
    for (const risk of [Risk.Low, Risk.Medium, Risk.High]) {
      await (await game.connect(signers.alice).startRound(risk)).wait();
      const path = [0, 6, 12, 18, 24, 4];
      const hits: boolean[] = [];
      for (const cell of path) {
        await expect(game.connect(signers.alice).openCell(cell)).to.emit(game, "CellOpened");
        hits.push(await decryptLastHit(signers.alice));
      }
      const liveScore = await decryptScore(signers.alice);
      const r = await cashOutAndSettle(signers.alice);
      expect(r.status).to.eq(Status.Settled);
      const board = Number(r.revealedBoard);
      expect(board >>> 25, "board fits the 5x5 grid").to.eq(0);
      path.forEach((cell, i) => expect(hits[i]).to.eq(((board >>> cell) & 1) === 1));
      expect(Number(r.finalScore)).to.eq(expectedScore(board, path, risk));
      expect(Number(r.finalScore)).to.eq(liveScore);
      expect(Number(r.opened)).to.eq(path.reduce((m, c) => m | (1 << c), 0));
    }
  });

  it("a mine wipes the score and the player stays dead for the rest of the round", async function () {
    // Play rounds on High risk until we hit a mine (P(no mine in 25 cells) is negligible).
    let found = false;
    for (let round = 0; round < 6 && !found; round++) {
      await (await game.connect(signers.alice).startRound(Risk.High)).wait();
      for (let cell = 0; cell < 25; cell++) {
        await (await game.connect(signers.alice).openCell(cell)).wait();
        if (await decryptLastHit(signers.alice)) {
          found = true;
          expect(await decryptAlive(signers.alice)).to.eq(false);
          expect(await decryptScore(signers.alice)).to.eq(0);
          if (cell < 24) {
            await (await game.connect(signers.alice).openCell(cell + 1)).wait();
            expect(await decryptScore(signers.alice)).to.eq(0);
            expect(await decryptAlive(signers.alice)).to.eq(false);
          }
          const r = await cashOutAndSettle(signers.alice);
          expect(r.finalScore).to.eq(0);
          expect(await game.getLeaderboard()).to.have.length(0);
          break;
        }
      }
    }
    expect(found).to.eq(true);
  });

  it("anyone can settle with a valid KMS proof; forged cleartexts are rejected", async function () {
    await (await game.connect(signers.alice).startRound(Risk.Low)).wait();
    await (await game.connect(signers.alice).openCell(7)).wait();
    await (await game.connect(signers.alice).cashOut()).wait();
    expect((await game.getRound(signers.alice.address)).status).to.eq(Status.Settling);

    // Cannot restart or keep playing while settling
    await expect(game.connect(signers.alice).startRound(Risk.Low)).to.be.revertedWithCustomError(
      game,
      "RoundInProgress",
    );
    await expect(game.connect(signers.alice).openCell(8)).to.be.revertedWithCustomError(game, "RoundNotActive");

    const h = await game.getHandles(signers.alice.address);
    const res = await fhevm.publicDecrypt([h.score, h.board]);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint32", "uint32"], [999999, 0]);
    await expect(game.connect(signers.bob).settle(signers.alice.address, forged, res.decryptionProof)).to.be.reverted;

    await expect(
      game.connect(signers.bob).settle(signers.alice.address, res.abiEncodedClearValues, res.decryptionProof),
    ).to.emit(game, "RoundSettled");
    expect((await game.getRound(signers.alice.address)).status).to.eq(Status.Settled);
  });

  it("tracks best scores and keeps a sorted top-10 leaderboard", async function () {
    const all = await ethers.getSigners();
    const players = all.slice(1, 13);
    for (const p of players) {
      // Play until the player banks a positive score (Low risk, 1-3 steps).
      for (let attempt = 0; attempt < 8; attempt++) {
        await (await game.connect(p).startRound(Risk.Low)).wait();
        await (await game.connect(p).openCell(attempt % 25)).wait();
        if (await decryptLastHit(p)) continue;
        await (await game.connect(p).openCell((attempt + 5) % 25)).wait();
        const r = await cashOutAndSettle(p, signers.deployer);
        expect(await game.bestScore(p.address)).to.be.gte(r.finalScore);
        if (r.finalScore > 0n) break;
      }
    }
    const lb = await game.getLeaderboard();
    expect(lb.length).to.be.lte(10);
    expect(lb.length).to.be.gt(0);
    for (let i = 1; i < lb.length; i++) expect(lb[i - 1].score).to.be.gte(lb[i].score);
    lb.forEach((e) => expect(e.score).to.be.gt(0));
  });

  it("starting a new round forfeits the old one and resets state", async function () {
    await (await game.connect(signers.alice).startRound(Risk.Low)).wait();
    await (await game.connect(signers.alice).openCell(1)).wait();
    await (await game.connect(signers.alice).startRound(Risk.High)).wait();
    const r = await game.getRound(signers.alice.address);
    expect(r.steps).to.eq(0);
    expect(r.opened).to.eq(0);
    expect(r.risk).to.eq(Risk.High);
    expect(await game.roundCount(signers.alice.address)).to.eq(2);
    expect(await decryptScore(signers.alice)).to.eq(0);
  });
  it("mine density matches the published odds for each risk level (statistical)", async function () {
    const targets = [1 / 8, 1 / 4, 3 / 8];
    for (const risk of [Risk.Low, Risk.Medium, Risk.High]) {
      let mines = 0;
      const rounds = 24;
      for (let i = 0; i < rounds; i++) {
        await (await game.connect(signers.alice).startRound(risk)).wait();
        await (await game.connect(signers.alice).openCell(0)).wait();
        const r = await cashOutAndSettle(signers.alice);
        let b = Number(r.revealedBoard);
        while (b) {
          mines += b & 1;
          b >>>= 1;
        }
      }
      const density = mines / (rounds * 25);
      expect(Math.abs(density - targets[risk]), `risk ${risk} density ${density}`).to.be.lt(0.07);
    }
  });
});
