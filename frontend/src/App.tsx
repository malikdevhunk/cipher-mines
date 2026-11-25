import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Board, type Cell } from "./components/Board";
import { Arrow, Check, Close, Lock, Mark, Spinner } from "./components/Icons";
import { CELLS, CONTRACT_ADDRESS, EXPLORER, REPO_URL, RISKS, stepReward, type Risk } from "./config";
import { createPracticeEngine } from "./engine/practice";
import type { GameEngine, LeaderRow, LogLine, Settlement } from "./engine/types";
import { useReducedMotion } from "./hooks";

type Phase = "idle" | "playing" | "dead" | "settling" | "settled";
type SettlePhase = "request" | "decrypt" | "verify" | null;

const fresh = (): Cell[] => Array.from({ length: CELLS }, () => ({ state: "sealed" }));
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const cellName = (i: number) => `${"ABCDE"[i % 5]}${Math.floor(i / 5) + 1}`;
const popcount = (n: number) => {
  let c = 0;
  for (let x = n >>> 0; x; x >>>= 1) c += x & 1;
  return c;
};

/** Turns wallet / RPC noise into one readable sentence. The raw text never reaches the UI. */
function friendly(raw: string): string {
  if (/user rejected|denied|ACTION_REJECTED/i.test(raw)) return "You declined the request in your wallet.";
  if (/could not decode result data|BAD_DATA/i.test(raw))
    return "Couldn’t read the contract. Check your wallet is on Sepolia and the deployment address is right.";
  if (/insufficient funds/i.test(raw)) return "Not enough Sepolia ETH in this wallet for the transaction.";
  if (/No browser wallet/i.test(raw)) return raw;
  return raw.split(" (")[0].split("\n")[0];
}

/** Radio group with the keyboard model from the ARIA authoring practices: one tab stop, arrows move and select. */
function RiskPicker({ value, onChange, disabled }: { value: Risk; onChange: (r: Risk) => void; disabled: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + RISKS.length) % RISKS.length;
    onChange(RISKS[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-label="Risk level">
      {RISKS.map((x, i) => (
        <button
          key={x.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === x.id}
          tabIndex={value === x.id ? 0 : -1}
          className={value === x.id ? "on" : ""}
          disabled={disabled}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(x.id)}
        >
          <b>{x.name}</b>
          <span>
            {x.odds} cells · ×{x.points}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const reduced = useReducedMotion();
  const [log, setLog] = useState<LogLine[]>([]);
  const push = useCallback((l: Omit<LogLine, "t">) => setLog((p) => [...p.slice(-40), { ...l, t: Date.now() }]), []);
  const [engine, setEngine] = useState<GameEngine>(() => createPracticeEngine(push));
  const [connecting, setConnecting] = useState(false);

  const [risk, setRisk] = useState<Risk>(1);
  const [cells, setCells] = useState<Cell[]>(fresh);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [steps, setSteps] = useState(0);
  const [score, setScore] = useState(0);
  const [boardHandle, setBoardHandle] = useState<string>();
  const [settlePhase, setSettlePhase] = useState<SettlePhase>(null);
  const [result, setResult] = useState<Settlement | null>(null);
  const [outcomes, setOutcomes] = useState<Record<number, boolean>>({});
  const [shake, setShake] = useState(false);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const logRef = useRef<HTMLOListElement>(null);
  const toastTimer = useRef<number>();

  const r = RISKS[risk];
  const nextReward = stepReward(risk, steps + 1);
  const inRound = phase !== "idle";
  const pickerVisible = phase === "idle" || phase === "settled";
  const heroCollapsed = phase !== "idle";

  const refreshBoard = useCallback(async (e: GameEngine) => {
    setRowsLoading(true);
    try {
      setRows(await e.leaderboard());
    } catch {
      /* leaderboard is best effort; the empty state explains itself */
    } finally {
      setRowsLoading(false);
    }
  }, []);

  useEffect(() => {
    push({ kind: "info", text: "practice table open · no wallet needed" });
    refreshBoard(engine);
  }, []); // eslint-disable-line

  useEffect(() => {
    logRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [log]);

  useEffect(() => {
    if (!menu) return;
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [menu]);

  const fail = (e: unknown, retry?: () => void) => {
    const raw = e instanceof Error ? e.message : String(e);
    const msg = friendly(raw);
    const short = msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
    setError({ message: short, retry });
    setToast(short);
    push({ kind: "bad", text: msg.slice(0, 90) });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6500);
  };

  function resetTable() {
    setCells(fresh());
    setPhase("idle");
    setSteps(0);
    setScore(0);
    setResult(null);
    setOutcomes({});
    setBoardHandle(undefined);
    setSettlePhase(null);
    setError(null);
  }

  async function connect() {
    setConnecting(true);
    setError(null);
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
      fail(e, connect);
    } finally {
      setConnecting(false);
    }
  }

  async function start() {
    setBusy(true);
    setSealing(true);
    try {
      resetTable();
      const { boardHandle } = await engine.start(risk);
      setBoardHandle(boardHandle);
      setPhase("playing");
    } catch (e) {
      fail(e, start);
    } finally {
      setBusy(false);
      setSealing(false);
    }
  }

  async function open(i: number) {
    if (busy || phase !== "playing") return;
    setBusy(true);
    setError(null);
    setCells((c) => c.map((x, j) => (j === i ? { state: "pending" } : x)));
    try {
      const res = await engine.open(i);
      setSteps((s) => s + 1);
      setOutcomes((o) => ({ ...o, [i]: res.hit }));
      setScore(res.score);
      if (res.hit) {
        setCells((c) => c.map((x, j) => (j === i ? { state: "hit" } : x)));
        setPhase("dead");
        if (!reduced) {
          setShake(true);
          setTimeout(() => setShake(false), 420);
        }
        push({ kind: "bad", text: `mine at ${cellName(i)} · score wiped` });
      } else {
        const gained = stepReward(risk, steps + 1);
        setCells((c) => c.map((x, j) => (j === i ? { state: "safe", pts: gained } : x)));
        push({ kind: "ok", text: `safe at ${cellName(i)} · +${gained}` });
      }
    } catch (e) {
      setCells((c) => c.map((x, j) => (j === i ? { state: "sealed" } : x)));
      fail(e, () => open(i));
    } finally {
      setBusy(false);
    }
  }

  async function settle() {
    setBusy(true);
    setPhase("settling");
    setError(null);
    try {
      const s = await engine.cashOut(setSettlePhase);
      setResult(s);
      setCells((prev) =>
        prev.map((c, i) => {
          if (c.state === "safe" || c.state === "hit") return c;
          return { state: ((s.board >>> i) & 1) === 1 ? "mine" : "clear" };
        }),
      );
      setScore(s.score);
      setPhase("settled");
      push({
        kind: s.verified ? "ok" : "info",
        text: s.verified ? "settled · KMS proof verified on-chain" : "practice round revealed",
      });
      refreshBoard(engine);
    } catch (e) {
      setPhase(Object.values(outcomes).includes(true) ? "dead" : "playing");
      fail(e, settle);
    } finally {
      setSettlePhase(null);
      setBusy(false);
    }
  }

  const consistent = useMemo(() => {
    if (!result) return null;
    return Object.entries(outcomes).every(([cell, hit]) => (((result.board >>> Number(cell)) & 1) === 1) === hit);
  }, [result, outcomes]);

  const hitKey = Object.keys(outcomes).find((k) => outcomes[+k]);
  const hitCell = hitKey === undefined ? undefined : Number(hitKey);

  const status = (() => {
    if (error) return { tone: "error", title: "That didn’t go through.", sub: error.message };
    if (phase === "idle")
      return {
        tone: "",
        title: "Pick a risk, then seal a board.",
        sub: "The mines are drawn encrypted. Nobody can read them, including this page.",
      };
    if (phase === "playing" && steps === 0)
      return {
        tone: "",
        title: "Board sealed. Open any cell.",
        sub: "Each safe cell pays more than the last. One mine wipes the round.",
      };
    if (phase === "playing")
      return {
        tone: "",
        title: `${steps} safe. Push on or cash out?`,
        sub: `Next safe cell pays +${nextReward}. Each cell is a mine at ${r.odds}.`,
      };
    if (phase === "dead")
      return {
        tone: "warn",
        title: hitCell === undefined ? "Mine hit." : `Mine at ${cellName(hitCell)}.`,
        sub: "Your score is sealed until you reveal and verify the round.",
      };
    if (phase === "settling")
      return { tone: "", title: "Revealing the board…", sub: "Score and map are being decrypted with a KMS proof." };
    return {
      tone: "",
      title: result && result.score > 0 ? `Banked ${result.score} points.` : "Settled at zero.",
      sub: result?.verified
        ? "Map and score verified on-chain against the KMS signatures."
        : "Practice round: generated in your browser, not on-chain.",
    };
  })();

  const scoreShown = phase === "idle" ? "—" : phase === "dead" || phase === "settling" ? "sealed" : String(score);
  const mines = result ? popcount(result.board) : null;
  const canCash = phase === "playing" && steps > 0 && !busy;
  const working = sealing || phase === "settling";

  const modeChip =
    engine.kind === "sepolia" ? (
      <span className="chip live">
        <i aria-hidden="true" /> Sepolia · {shortAddr(engine.account!)}
      </span>
    ) : (
      <span className="chip">
        <i aria-hidden="true" /> Practice table · off-chain
      </span>
    );

  return (
    <div className="app">
      <a className="skip" href="#table">
        Skip to the game
      </a>
      <header className="top">
        <a className="brand" href="#play" aria-label="Cipher Mines, home">
          <Mark />
          <span>Cipher Mines</span>
        </a>
        <nav className="nav" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#ranks">Leaderboard</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source<span className="sr"> (opens in a new tab)</span>
          </a>
        </nav>
        <div className="who">
          <span className="chip-wide">{modeChip}</span>
          {engine.kind === "practice" &&
            (CONTRACT_ADDRESS ? (
              <button type="button" className="btn ghost sm" onClick={connect} disabled={connecting}>
                {connecting ? <Spinner /> : null}
                {connecting ? "Connecting…" : "Play on Sepolia"}
              </button>
            ) : (
              <span className="chip pending">
                <i aria-hidden="true" /> Sepolia · deploy pending
              </span>
            ))}
          <button
            type="button"
            className="menu-btn"
            aria-expanded={menu}
            aria-controls="menu"
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? "Close" : "Menu"}
          </button>
        </div>
        {menu && (
          <nav id="menu" className="menu" aria-label="Sections">
            <a href="#how" onClick={() => setMenu(false)}>
              How it works
            </a>
            <a href="#ranks" onClick={() => setMenu(false)}>
              Leaderboard
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>
              Source<span className="sr"> (opens in a new tab)</span>
            </a>
          </nav>
        )}
      </header>

      <main id="play" className={`stage${heroCollapsed ? " in-round" : ""}`}>
        <section className="side">
          <div className="hero" data-collapsed={heroCollapsed}>
            <div className="hero-in">
              <h1>A minefield nobody can&nbsp;see.</h1>
              <p className="lede">
                The mines are drawn with encrypted on-chain randomness and stay sealed from you, the deployer and every
                block explorer. Open cells, bank points, cash out before the floor gives way.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="mode-row">{modeChip}</div>

            {pickerVisible ? (
              <div className="field">
                <div className="field-head">
                  <span id="risk-label" className="label">
                    Risk
                  </span>
                  <span className="hint">points per step × step number</span>
                </div>
                <RiskPicker value={risk} onChange={setRisk} disabled={busy} />
              </div>
            ) : null}

            {inRound && (
              <dl className="stats">
                {!pickerVisible && (
                  <div>
                    <dt>Risk</dt>
                    <dd className="word">{r.name}</dd>
                    <small>{r.odds} cells</small>
                  </div>
                )}
                <div>
                  <dt>
                    <Lock open={phase === "settled"} /> Score
                  </dt>
                  <dd className={`num${scoreShown === "sealed" ? " sealed" : ""}`} key={scoreShown}>
                    {scoreShown}
                  </dd>
                  <small>{phase === "settled" ? "verified" : "only you can read"}</small>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd className="num">{phase === "playing" ? `+${nextReward}` : "—"}</dd>
                  <small>if safe</small>
                </div>
                <div>
                  <dt>Opened</dt>
                  <dd className="num">
                    {steps}
                    <span className="of">/{CELLS}</span>
                  </dd>
                  <small>public</small>
                </div>
              </dl>
            )}

            <div className={`status ${status.tone}`} role={error ? "alert" : "status"}>
              <div>
                <p className="s-title">{status.title}</p>
                <p className="s-sub">{status.sub}</p>
              </div>
              {error?.retry && (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => error.retry?.()}
                  disabled={busy || connecting}
                >
                  Try again
                </button>
              )}
            </div>

            <div className={`actions${inRound ? " dock" : ""}`}>
              {phase === "idle" || phase === "settled" ? (
                <button type="button" className="btn primary" onClick={start} disabled={busy}>
                  {sealing ? <Spinner /> : null}
                  {sealing ? "Sealing…" : phase === "settled" ? "Seal a new board" : "Seal a board"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`btn ${phase === "dead" ? "primary" : "ink"}`}
                    onClick={settle}
                    disabled={phase === "dead" ? busy : !canCash}
                  >
                    {phase === "settling" ? <Spinner /> : null}
                    {phase === "settling"
                      ? "Settling…"
                      : phase === "dead"
                        ? "Reveal and verify"
                        : steps === 0
                          ? "Cash out"
                          : `Cash out ${score}`}
                  </button>
                  {phase !== "settling" && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={start}
                      disabled={busy}
                      title="Forfeit this round and draw a new board"
                    >
                      New board
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="ledger">
            <div className="field-head">
              <span className="label">Ciphertext ledger</span>
              <span className="hint">{engine.kind === "sepolia" ? "live · Sepolia" : "practice · simulated"}</span>
            </div>
            <ol ref={logRef} aria-label="Ciphertext ledger">
              {[...log].reverse().map((l) => (
                <li key={l.t + l.text} className={`k-${l.kind}`}>
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

        <section id="table" className="table" aria-label="Game board">
          <Board
            cells={cells}
            interactive={phase === "playing" && !busy}
            onOpen={open}
            shake={shake}
            working={working}
          />

          <div className={`under${phase === "settling" || phase === "settled" ? "" : " hide-sm"}`}>
            {phase === "settling" || phase === "settled" ? (
              engine.kind === "practice" ? (
                <p className="sealed-line">
                  <Lock open />
                  Practice reveal. On Sepolia this is a KMS public decryption, checked on-chain.
                </p>
              ) : (
                <ol className="steps">
                  {(["request", "decrypt", "verify"] as const).map((p, idx) => {
                    const order = ["request", "decrypt", "verify"];
                    const cur = settlePhase ? order.indexOf(settlePhase) : 3;
                    const st = idx < cur ? "done" : idx === cur ? "now" : "";
                    return (
                      <li key={p} className={st}>
                        <span className="dot">{idx < cur ? <Check /> : idx + 1}</span>
                        {p === "request" ? "Mark decryptable" : p === "decrypt" ? "KMS decrypts" : "Verify proof"}
                      </li>
                    );
                  })}
                </ol>
              )
            ) : (
              <p className="sealed-line hide-sm">
                <Lock />
                {boardHandle ? (
                  <>
                    Board ciphertext{" "}
                    <code>
                      {boardHandle.slice(0, 10)}…{boardHandle.slice(-6)}
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
                <strong className="check">
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
                  <span className="sr"> (opens in a new tab)</span>
                </a>
              )}
            </div>
          )}
        </section>
      </main>

      <section id="how" className="section">
        <div className="section-head">
          <h2>Make the board public and the game is over.</h2>
          <p className="lede">
            On a transparent chain anyone can read the mine map from storage and walk a perfect path. Cipher Mines keeps
            every hidden value as FHE ciphertext and opens it only when the round is settled.
          </p>
        </div>
        <div className="matrix">
          {[
            [
              "Mine map",
              "euint32 · 25 bits",
              "Nobody",
              "n",
              "Drawn with FHE.randEuint32 on-chain. Only the contract can compute on it.",
            ],
            [
              "Step outcome",
              "ebool",
              "Only you",
              "y",
              "Was that cell a mine? Computed under encryption, decrypted in your browser.",
            ],
            ["Running score", "euint32", "Only you", "y", "A mine zeroes it with FHE.select, and nobody learns when."],
            [
              "Your choices",
              "uint32 bitmap",
              "Everyone",
              "e",
              "Which cells you open is public, so a bad step can’t be re-rolled.",
            ],
            [
              "Settlement",
              "public decryption",
              "Everyone",
              "e",
              "Score and map are decrypted by the KMS and its signature is checked on-chain.",
            ],
          ].map(([what, type, who, tone, why]) => (
            <article key={what} className="row">
              <h3>{what}</h3>
              <code>{type}</code>
              <span className={`who-tag ${tone}`}>{who}</span>
              <p>{why}</p>
            </article>
          ))}
        </div>
        <dl className="odds">
          {RISKS.map((x) => (
            <div key={x.id}>
              <dt>{x.name}</dt>
              <dd>{x.odds}</dd>
              <div className="bar" aria-hidden="true">
                <i style={{ width: `${x.density * 100}%` }} />
              </div>
              <small>
                ×{x.points} per step · {x.blurb}
              </small>
            </div>
          ))}
        </dl>
      </section>

      <section id="ranks" className="section">
        <div className="section-head">
          <h2>Verified scores only.</h2>
          <p className="lede">A score lands here only after its KMS proof has been checked on-chain.</p>
        </div>
        {rowsLoading ? (
          <ul className="lb skeleton" aria-label="Loading leaderboard">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <span />
                <span />
                <span />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className="empty">No settled scores yet. Be the first to cash out.</p>
        ) : (
          <ol className="lb">
            {rows.map((e, i) => (
              <li key={`${e.player}-${e.score}-${i}`}>
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
            Saddam Malik<span className="sr"> (opens in a new tab)</span>
          </a>
          . “Cipher Mines” and its mark are not covered by the code license.
        </span>
        <span className="foot-links">
          <a href="#how">How it works</a>
          <a href="#ranks">Leaderboard</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source<span className="sr"> (opens in a new tab)</span>
          </a>
          {CONTRACT_ADDRESS ? (
            <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              Contract {shortAddr(CONTRACT_ADDRESS)}
            </a>
          ) : (
            <span>Sepolia deployment pending</span>
          )}
        </span>
      </footer>

      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setToast(null)}>
            <Close />
          </button>
        </div>
      )}
    </div>
  );
}
