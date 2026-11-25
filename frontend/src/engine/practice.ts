import { CELLS, stepReward, type Risk } from "../config";
import type { GameEngine, LeaderRow, Logger, Settlement, StepResult } from "./types";

const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const MASK = (1 << CELLS) - 1;
const LB_KEY = "cipher-mines:practice-leaderboard";

/** Same board recipe as the contract, but generated in the browser. Off-chain, not encrypted. */
function makeBoard(risk: Risk) {
  const a = rand32(),
    b = rand32(),
    c = rand32();
  const raw = risk === 0 ? a & b & c : risk === 1 ? a & b : a & (b | c);
  return (raw & MASK) >>> 0;
}
const fakeHandle = () =>
  "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, "0")).join("");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createPracticeEngine(log: Logger): GameEngine {
  // The board lives only in this closure; the UI never reads it before cash-out.
  let board = 0,
    risk: Risk = 1,
    steps = 0,
    alive = true,
    score = 0;
  return {
    kind: "practice",
    async resume() {
      return null;
    },
    async start(r) {
      risk = r;
      board = makeBoard(r);
      steps = 0;
      alive = true;
      score = 0;
      const h = fakeHandle();
      log({ kind: "fhe", text: `board sealed · ${h.slice(0, 10)}…${h.slice(-6)}` });
      return { boardHandle: h };
    },
    async open(cell): Promise<StepResult> {
      await wait(260);
      steps += 1;
      const hit = ((board >>> cell) & 1) === 1;
      alive = alive && !hit;
      score = alive ? score + stepReward(risk, steps) : 0;
      const h = fakeHandle();
      log({ kind: "fhe", text: `cell ${cell} → ebool ${h.slice(0, 10)}…` });
      return { cell, hit, alive, score, handle: h };
    },
    async cashOut(onPhase): Promise<Settlement> {
      onPhase("request");
      await wait(350);
      onPhase("decrypt");
      await wait(500);
      onPhase("verify");
      await wait(300);
      const rows: LeaderRow[] = JSON.parse(localStorage.getItem(LB_KEY) ?? "[]");
      if (score > 0) {
        rows.push({ player: "you (practice)", score, risk, steps });
        rows.sort((x, y) => y.score - x.score);
        localStorage.setItem(LB_KEY, JSON.stringify(rows.slice(0, 10)));
      }
      return { board, score, verified: false };
    },
    async leaderboard() {
      return JSON.parse(localStorage.getItem(LB_KEY) ?? "[]");
    },
  };
}
