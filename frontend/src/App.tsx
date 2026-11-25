import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board, type Cell } from "./components/Board";
import { Arrow, Check, Lock, Mark } from "./components/Icons";
import { CELLS, CONTRACT_ADDRESS, EXPLORER, REPO_URL, RISKS, stepReward, type Risk } from "./config";
import { createPracticeEngine } from "./engine/practice";
import type { GameEngine, LeaderRow, LogLine, Settlement } from "./engine/types";

type Phase = "idle" | "playing" | "dead" | "settling" | "settled";
type SettlePhase = "request" | "decrypt" | "verify" | null;

const fresh = (): Cell[] => Array.from({ length: CELLS }, () => ({ state: "sealed" }));
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const popcount = (n: number) => {
  let c = 0;
  for (let x = n >>> 0; x; x >>>= 1) c += x & 1;
  return c;
};

export default function App() {
  const [log, setLog] = useState<LogLine[]>([]);
  const push = useCallback((l: Omit<LogLine, "t">) => setLog((p) => [...p.slice(-40), { ...l, t: Date.now() }]), []);
  const [engine, setEngine] = useState<GameEngine>(() => createPracticeEngine(push));
  const [connecting, setConnecting] = useState(false);

  const [risk, setRisk] = useState<Risk>(1);
  const [cells, setCells] = useState<Cell[]>(fresh);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState(0);
  const [score, setScore] = useState(0);
  const [boardHandle, setBoardHandle] = useState<string>();
  const [settlePhase, setSettlePhase] = useState<SettlePhase>(null);
  const [result, setResult] = useState<Settlement | null>(null);
  const [outcomes, setOutcomes] = useState<Record<number, boolean>>({});
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const logRef = useRef<HTMLOListElement>(null);

  const r = RISKS[risk];
  const nextReward = stepReward(risk, steps + 1);

  const refreshBoard = useCallback(async (e: GameEngine) => {
    try {
      setBoard(await e.leaderboard());
    } catch {
      /* leaderboard is best-effort */
    }
  }, []);

  useEffect(() => {
    push({ kind: "info", text: "practice table open · no wallet needed" });
    refreshBoard(engine);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    setToast(msg.length > 160 ? msg.slice(0, 160) + "…" : msg);
    push({ kind: "bad", text: msg.slice(0, 90) });
    setTimeout(() => setToast(null), 5200);
  };

  async function connect() {
    setConnecting(true);
    try {
      const { createChainEngine } = await import("./engine/chain");
      const e = await createChainEngine(push);
      setEngine(e);
      resetTable();
      const resumed = await e.resume();
      if (resumed) {
        setRisk(resumed.risk);
        setSteps(resumed.opened.length);
        setScore(resumed.score);
        setCells(fresh().map((c, i) => (resumed.opened.includes(i) ? { state: "clear" } : c)));
        setPhase(resumed.alive ? "playing" : "dead");
        push({ kind: "info", text: `resumed your active round · ${resumed.opened.length} cells opened` });
      }
      refreshBoard(e);
    } catch (e) {
      fail(e);
    } finally {
      setConnecting(false);
    }
  }

  function resetTable() {
    setCells(fresh());
    setPhase("idle");
    setSteps(0);
    setScore(0);
    setResult(null);
    setOutcomes({});
    setBoardHandle(undefined);
    setSettlePhase(null);
  }

  async function start() {
    setBusy(true);
    try {
      resetTable();
      const { boardHandle } = await engine.start(risk);
      setBoardHandle(boardHandle);
      setPhase("playing");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function open(i: number) {
    if (busy || phase !== "playing") return;
    setBusy(true);
    setCells((c) => c.map((x, j) => (j === i ? { state: "pending" } : x)));
    try {
      const res = await engine.open(i);
      setSteps((s) => s + 1);
      setOutcomes((o) => ({ ...o, [i]: res.hit }));
      setScore(res.score);
      if (res.hit) {
        setCells((c) => c.map((x, j) => (j === i ? { state: "hit" } : x)));
        setPhase("dead");
        setShake(true);
        setTimeout(() => setShake(false), 520);
        push({ kind: "bad", text: `mine at ${"ABCDE"[i % 5]}${Math.floor(i / 5) + 1} · score wiped` });
      } else {
        const gained = stepReward(risk, steps + 1);
        setCells((c) => c.map((x, j) => (j === i ? { state: "safe", pts: gained } : x)));
        push({ kind: "ok", text: `safe · +${gained} (decrypted for you only)` });
      }
    } catch (e) {
      setCells((c) => c.map((x, j) => (j === i ? { state: "sealed" } : x)));
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function settle() {
    setBusy(true);
    setPhase("settling");
    try {
      const s = await engine.cashOut(setSettlePhase);
      setResult(s);
      setCells((prev) =>
        prev.map((c, i) => {
          if (c.state === "safe" || c.state === "hit") return c;
          const mine = ((s.board >>> i) & 1) === 1;
          return { state: mine ? "mine" : "clear" };
        }),
      );
      setPhase("settled");
      push({
        kind: s.verified ? "ok" : "info",
        text: s.verified ? `round settled · KMS proof verified on-chain` : "practice round revealed",
      });
      refreshBoard(engine);
    } catch (e) {
      setPhase(score > 0 || steps > 0 ? "playing" : "idle");
      fail(e);
    } finally {
      setSettlePhase(null);
      setBusy(false);
    }
  }

  const consistent = useMemo(() => {
    if (!result) return null;
    return Object.entries(outcomes).every(([cell, hit]) => (((result.board >>> Number(cell)) & 1) === 1) === hit);
  }, [result, outcomes]);

  const status = (() => {
    if (phase === "idle")
      return {
        tone: "",
        title: "Choose your risk, then seal a board.",
        sub: "Mines are drawn with encrypted randomness. Nobody can see them, not even this page.",
      };
    if (phase === "playing" && steps === 0)
      return {
        tone: "",
        title: "Board sealed. Pick any cell.",
        sub: "Each safe cell pays more than the last. One mine wipes the round.",
      };
    if (phase === "playing")
      return {
        tone: "good",
        title: `${steps} safe ${steps === 1 ? "cell" : "cells"}. Push or cash out?`,
        sub: `The next safe cell pays +${nextReward}. Odds per cell: ${r.odds}.`,
      };
    if (phase === "dead")
      return {
        tone: "bad",
        title: "The floor gave way.",
        sub: "Your score was wiped under encryption. Settle to reveal the map and verify it was fair.",
      };
    if (phase === "settling")
      return {
        tone: "",
        title: "Revealing the board…",
        sub: "Score and mine map are being publicly decrypted with a KMS proof.",
      };
    return {
      tone: result && result.score > 0 ? "good" : "bad",
      title: result && result.score > 0 ? `Banked ${result.score} points.` : "Round settled at zero.",
      sub: result?.verified
        ? "Map and score verified on-chain against the KMS signatures."
        : "Practice round: generated in your browser, not on-chain.",
    };
  })();

  const mines = result ? popcount(result.board) : null;
  const canCash = (phase === "playing" || phase === "dead") && steps > 0 && !busy;

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />
      <header className="top">
        <a className="brand" href="#play">
          <Mark />
          <span>Cipher Mines</span>
        </a>
        <nav className="nav">
          <a href="#how">How it works</a>
          <a href="#ranks">Leaderboard</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source
          </a>
        </nav>
        <div className="who">
          {engine.kind === "sepolia" ? (
            <span className="pill live">
              <i /> Sepolia · {shortAddr(engine.account!)}
            </span>
          ) : (
            <>
              <span className="pill">Practice table</span>
              <button
                className="btn ghost sm"
                onClick={connect}
                disabled={connecting || !CONTRACT_ADDRESS}
                title={CONTRACT_ADDRESS ? "" : "Sepolia contract not deployed yet"}
              >
                {connecting ? "Connecting…" : CONTRACT_ADDRESS ? "Play on Sepolia" : "Sepolia soon"}
              </button>
            </>
          )}
        </div>
      </header>

      <main id="play" className="stage">
        <section className="intro">
          <p className="eyebrow">Confidential game · Zama FHEVM</p>
          <h1>
            A minefield <em>nobody</em> can&nbsp;see.
          </h1>
          <p className="lede">
            Mines are drawn with encrypted on-chain randomness and stay sealed from you, the deployer and every block
            explorer. Open cells, bank points, and cash out before the floor gives way.
          </p>

          <div className="card controls">
            <div className="label-row">
              <span className="label">Risk</span>
              <span className="hint">points per step × step number</span>
            </div>
            <div className="seg" role="radiogroup" aria-label="Risk level">
              {RISKS.map((x) => (
                <button
                  key={x.id}
                  role="radio"
                  aria-checked={risk === x.id}
                  className={risk === x.id ? "on" : ""}
                  disabled={phase === "playing" || phase === "dead" || phase === "settling" || busy}
                  onClick={() => setRisk(x.id)}
                >
                  <b>{x.name}</b>
                  <span>{x.odds} cells</span>
                  <small>×{x.points}</small>
                </button>
              ))}
            </div>

            <div className="stats">
              <div>
                <span className="label">
                  <Lock open={phase !== "idle"} /> Your score
                </span>
                <strong className={`num ${phase === "dead" ? "bad" : ""}`} key={score}>
                  {phase === "idle" ? "—" : score}
                </strong>
                <small>{engine.kind === "sepolia" ? "decrypted for you only" : "hidden from everyone else"}</small>
              </div>
              <div>
                <span className="label">Next cell</span>
                <strong className="num gold">{phase === "playing" ? `+${nextReward}` : "—"}</strong>
                <small>if it's safe</small>
              </div>
              <div>
                <span className="label">Opened</span>
                <strong className="num">
                  {steps}
                  <span className="of">/{CELLS}</span>
                </strong>
                <small>choices are public</small>
              </div>
            </div>

            <div className={`status ${status.tone}`} aria-live="polite">
              <p className="s-title">{status.title}</p>
              <p className="s-sub">{status.sub}</p>
            </div>

            <div className={`actions ${phase === "playing" || phase === "dead" ? "float" : ""}`}>
              {phase === "idle" || phase === "settled" ? (
                <button className="btn primary" onClick={start} disabled={busy}>
                  {busy ? "Sealing…" : phase === "settled" ? "Seal a new board" : "Seal a board"}
                </button>
              ) : (
                <button className={`btn ${phase === "dead" ? "primary" : "cash"}`} onClick={settle} disabled={!canCash}>
                  {phase === "settling" ? "Settling…" : phase === "dead" ? "Reveal & verify" : `Cash out ${score}`}
                </button>
              )}
              {(phase === "playing" || phase === "dead") && (
                <button className="btn ghost" onClick={start} disabled={busy} title="Forfeit and draw a new board">
                  New board
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="table">
          <Board
            cells={cells}
            interactive={phase === "playing" && !busy}
            onOpen={open}
            shake={shake}
            dim={phase === "idle"}
          />

          <div className="under">
            {(phase === "settling" || phase === "settled") && engine.kind === "practice" ? (
              <p className="sealed-line">
                <Lock open />
                Practice reveal in your browser. On Sepolia this is a KMS public decryption, verified on-chain.
              </p>
            ) : phase === "settling" || phase === "settled" ? (
              <ol className="steps">
                {(["request", "decrypt", "verify"] as const).map((p, idx) => {
                  const order = ["request", "decrypt", "verify"];
                  const cur = settlePhase ? order.indexOf(settlePhase) : 3;
                  const st = idx < cur ? "done" : idx === cur ? "now" : "";
                  return (
                    <li key={p} className={st}>
                      <span className="dot">{idx < cur ? <Check /> : idx + 1}</span>
                      {p === "request"
                        ? "Mark score + map decryptable"
                        : p === "decrypt"
                          ? "KMS public decryption"
                          : "Verify proof on-chain"}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="sealed-line">
                <Lock />
                {boardHandle ? (
                  <>
                    Board ciphertext{" "}
                    <code>
                      {boardHandle.slice(0, 12)}…{boardHandle.slice(-6)}
                    </code>
                  </>
                ) : (
                  "No board sealed yet"
                )}
              </p>
            )}
          </div>

          {result && (
            <div className="verdict">
              <div>
                <span className="label">Final score</span>
                <strong className="num">{result.score}</strong>
              </div>
              <div>
                <span className="label">Mines on board</span>
                <strong className="num">{mines}</strong>
              </div>
              <div className={consistent ? "ok" : "bad"}>
                <span className="label">Fairness check</span>
                <strong className="verdict-check">
                  {consistent ? (
                    <>
                      <Check /> Every outcome matches
                    </>
                  ) : (
                    "Mismatch"
                  )}
                </strong>
              </div>
              {result.txHash && (
                <a className="tx" href={`${EXPLORER}/tx/${result.txHash}`} target="_blank" rel="noreferrer">
                  Settlement tx <Arrow />
                </a>
              )}
            </div>
          )}

          <div className="ledger card">
            <div className="label-row">
              <span className="label">Ciphertext ledger</span>
              <span className="hint">{engine.kind === "sepolia" ? "live · Sepolia" : "practice · simulated"}</span>
            </div>
            <ol ref={logRef}>
              {log.map((l, i) => (
                <li key={i} className={`k-${l.kind}`}>
                  <time>{new Date(l.t).toLocaleTimeString("en-GB", { hour12: false })}</time>
                  <span className="tag">{l.kind}</span>
                  {l.href ? (
                    <a href={l.href} target="_blank" rel="noreferrer">
                      {l.text}
                    </a>
                  ) : (
                    <span>{l.text}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <section id="how" className="how">
        <div className="how-head">
          <p className="eyebrow">Confidentiality design</p>
          <h2>
            Make the board public and the game <em>is over</em>.
          </h2>
          <p className="lede">
            On a transparent chain anyone could read the mine map from storage and walk a perfect path. Cipher Mines
            keeps every piece of hidden state as FHE ciphertext, and only opens it when the round is settled.
          </p>
        </div>
        <div className="matrix">
          {[
            [
              "Mine map",
              "euint32 · 25 bits",
              "Nobody",
              "Drawn with FHE.randEuint32 on-chain. Only the contract can compute on it.",
            ],
            [
              "Step outcome",
              "ebool",
              "Only you",
              "Was that cell a mine? Computed under encryption, decrypted in your browser.",
            ],
            [
              "Running score",
              "euint32",
              "Only you",
              "A mine sets it to zero with FHE.select, without anyone learning when.",
            ],
            [
              "Your choices",
              "uint8 · public",
              "Everyone",
              "Which cells you open is public, so nobody can re-roll a bad step.",
            ],
            [
              "Settlement",
              "public decrypt",
              "Everyone",
              "Score and map are decrypted by the KMS and its signature is checked on-chain.",
            ],
          ].map(([what, type, who, why]) => (
            <article key={what} className="row">
              <h3>{what}</h3>
              <code>{type}</code>
              <span className={`who-tag ${who === "Nobody" ? "n" : who === "Only you" ? "y" : "e"}`}>{who}</span>
              <p>{why}</p>
            </article>
          ))}
        </div>
        <div className="odds">
          {RISKS.map((x) => (
            <div key={x.id} className="odd">
              <span className="label">{x.name}</span>
              <strong>{x.odds}</strong>
              <div className="bar">
                <i style={{ width: `${x.density * 100}%` }} />
              </div>
              <small>
                ×{x.points} per step · {x.blurb}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section id="ranks" className="ranks">
        <div className="how-head">
          <p className="eyebrow">Leaderboard</p>
          <h2>Verified scores only.</h2>
          <p className="lede">A score lands here only after its KMS proof has been checked on-chain.</p>
        </div>
        {board.length === 0 ? (
          <p className="empty">No settled scores yet. Be the first to cash out.</p>
        ) : (
          <ol className="lb">
            {board.map((e, i) => (
              <li key={i}>
                <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="addr">{e.player.startsWith("0x") ? shortAddr(e.player) : e.player}</span>
                <span className="meta">
                  {RISKS[e.risk].name} · {e.steps} cells
                </span>
                <strong>{e.score}</strong>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="foot">
        <span>
          Built on the Zama Protocol by{" "}
          <a href="https://saddammalik.com" target="_blank" rel="noreferrer">
            Saddam Malik
          </a>
        </span>
        <span>
          {CONTRACT_ADDRESS ? (
            <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              Contract {shortAddr(CONTRACT_ADDRESS)}
            </a>
          ) : (
            "Sepolia deployment pending"
          )}
        </span>
      </footer>

      {toast && (
        <div className="toast" role="alert" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
