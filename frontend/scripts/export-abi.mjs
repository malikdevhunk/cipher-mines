// Copies the compiled CipherMines ABI from the Hardhat artifacts into the frontend.
import { readFileSync, writeFileSync } from "node:fs";
const art = JSON.parse(
  readFileSync(new URL("../../artifacts/contracts/CipherMines.sol/CipherMines.json", import.meta.url), "utf8"),
);
writeFileSync(new URL("../src/abi.json", import.meta.url), JSON.stringify(art.abi, null, 2) + "\n");
console.log("wrote src/abi.json");
