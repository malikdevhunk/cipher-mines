/** Sepolia deployment. Set VITE_CONTRACT_ADDRESS at build time once the contract is deployed. */
export const CONTRACT_ADDRESS: string = (import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined) ?? "";
export const SEPOLIA_CHAIN_ID = 11155111;
export const EXPLORER = "https://sepolia.etherscan.io";
export const REPO_URL = "https://github.com/malikdevhunk/cipher-mines";

export const GRID = 5;
export const CELLS = GRID * GRID;

export type Risk = 0 | 1 | 2;
export const RISKS: { id: Risk; name: string; odds: string; density: number; points: number; blurb: string }[] = [
  { id: 0, name: "Low", odds: "1 in 8", density: 1 / 8, points: 1, blurb: "Slow and steady" },
  { id: 1, name: "Medium", odds: "1 in 4", density: 1 / 4, points: 3, blurb: "The house special" },
  { id: 2, name: "High", odds: "3 in 8", density: 3 / 8, points: 6, blurb: "For the reckless" },
];

/** Points earned by the k-th safe cell (1-based) on a given risk: mirrors CipherMines.sol. */
export const stepReward = (risk: Risk, k: number) => RISKS[risk].points * k;
