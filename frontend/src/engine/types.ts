import type { Risk } from "../config";

export type StepResult = { cell: number; hit: boolean; alive: boolean; score: number; handle?: string };
export type Settlement = { board: number; score: number; txHash?: string; verified: boolean };
export type LeaderRow = { player: string; score: number; risk: Risk; steps: number };
export type LogLine = { t: number; kind: "tx" | "fhe" | "kms" | "info" | "ok" | "bad"; text: string; href?: string };

export type Resumed = { risk: Risk; opened: number[]; alive: boolean; score: number } | null;

export interface GameEngine {
  readonly kind: "practice" | "sepolia";
  readonly account?: string;
  resume(): Promise<Resumed>;
  start(risk: Risk): Promise<{ boardHandle?: string }>;
  open(cell: number): Promise<StepResult>;
  cashOut(onPhase: (phase: "request" | "decrypt" | "verify") => void): Promise<Settlement>;
  leaderboard(): Promise<LeaderRow[]>;
}

export type Logger = (l: Omit<LogLine, "t">) => void;
