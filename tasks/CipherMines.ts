import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("mines:address", "Prints the CipherMines address").setAction(async (_: TaskArguments, hre) => {
  const d = await hre.deployments.get("CipherMines");
  console.log("CipherMines address is " + d.address);
});

task("mines:leaderboard", "Prints the public leaderboard").setAction(async (_: TaskArguments, hre) => {
  const d = await hre.deployments.get("CipherMines");
  const c = await hre.ethers.getContractAt("CipherMines", d.address);
  const rows = await c.getLeaderboard();
  rows.forEach((e, i) => console.log(`${i + 1}. ${e.player}  score=${e.score}  risk=${e.risk}  steps=${e.steps}`));
});

/**
 * Plays one full round end-to-end (start → open cells → user-decrypt → cash out → public decrypt → settle).
 * Works on the local mock and on Sepolia:
 *   npx hardhat --network sepolia mines:play --risk 1 --cells 12,6,18
 */
task("mines:play", "Plays a full round and settles it with the KMS proof")
  .addOptionalParam("risk", "0=Low 1=Medium 2=High", "1")
  .addOptionalParam("cells", "comma-separated cells to open (0..24)", "12,6,18")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    const { FhevmType } = await import("@fhevm/hardhat-plugin");
    await fhevm.initializeCLIApi();
    const d = await deployments.get("CipherMines");
    const [player] = await ethers.getSigners();
    const game = await ethers.getContractAt("CipherMines", d.address);

    console.log(`player ${player.address} · contract ${d.address}`);
    await (await game.connect(player).startRound(Number(args.risk))).wait();
    console.log("round started, board sealed");

    for (const cell of String(args.cells).split(",").map(Number)) {
      await (await game.connect(player).openCell(cell)).wait();
      const h = await game.getHandles(player.address);
      const hit = await fhevm.userDecryptEbool(h.lastHit, d.address, player);
      const score = await fhevm.userDecryptEuint(FhevmType.euint32, h.score, d.address, player);
      console.log(`cell ${cell}: ${hit ? "MINE" : "safe"} · score ${score}`);
      if (hit) break;
    }

    await (await game.connect(player).cashOut()).wait();
    const h = await game.getHandles(player.address);
    const res = await fhevm.publicDecrypt([h.score, h.board]);
    const tx = await game.connect(player).settle(player.address, res.abiEncodedClearValues, res.decryptionProof);
    await tx.wait();
    const r = await game.getRound(player.address);
    const board = Number(r.revealedBoard);
    console.log(`settled in ${tx.hash}: score ${r.finalScore}`);
    for (let row = 0; row < 5; row++) {
      let line = "";
      for (let col = 0; col < 5; col++) line += (board >>> (row * 5 + col)) & 1 ? " X" : " .";
      console.log(line);
    }
  });
