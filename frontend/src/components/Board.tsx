import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { GRID } from "../config";
import { useReducedMotion } from "../hooks";
import { MineMark, SafeMark } from "./Icons";

export type CellState = "sealed" | "pending" | "safe" | "hit" | "mine" | "clear";
export type Cell = { state: CellState; pts?: number };

const HEX = "0123456789abcdef";
const hex2 = () => HEX[(Math.random() * 16) | 0] + HEX[(Math.random() * 16) | 0];
const COLS = ["A", "B", "C", "D", "E"];

/** Sealed tiles drift slowly; pending tiles scramble fast. With reduced motion they stay still. */
function Cipher({ fast, still }: { fast: boolean; still: boolean }) {
  const [v, setV] = useState(hex2);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setV(hex2()), fast ? 80 : 1800 + Math.random() * 2600);
    return () => clearInterval(id);
  }, [fast, still]);
  return <span className="cipher">{v}</span>;
}

type Props = {
  cells: Cell[];
  interactive: boolean;
  onOpen: (i: number) => void;
  shake: boolean;
  /** Whole board is waiting on a transaction (sealing / settling): layout stays, tiles scramble. */
  working: boolean;
};

export function Board({ cells, interactive, onOpen, shake, working }: Props) {
  const reduced = useReducedMotion();
  const [focusIdx, setFocusIdx] = useState(12);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    const n = Math.max(0, Math.min(cells.length - 1, to));
    setFocusIdx(n);
    refs.current[n]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const row = Math.floor(i / GRID),
      col = i % GRID;
    const next: Record<string, number> = {
      ArrowRight: col < GRID - 1 ? i + 1 : i,
      ArrowLeft: col > 0 ? i - 1 : i,
      ArrowDown: row < GRID - 1 ? i + GRID : i,
      ArrowUp: row > 0 ? i - GRID : i,
      Home: row * GRID,
      End: row * GRID + GRID - 1,
    };
    if (e.key in next) {
      e.preventDefault();
      move(next[e.key]);
    }
  };

  return (
    <div className={`plate${shake ? " shake" : ""}${working ? " working" : ""}`}>
      <div className="axis axis-top" aria-hidden="true">
        {COLS.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="axis axis-left" aria-hidden="true">
        {COLS.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div className="grid" role="grid" aria-label="Minefield, 5 by 5" aria-busy={working}>
        {cells.map((c, i) => {
          const row = Math.floor(i / GRID),
            col = i % GRID;
          const can = interactive && c.state === "sealed";
          const name = {
            sealed: "sealed",
            pending: "opening",
            safe: "safe",
            hit: "mine",
            mine: "mine",
            clear: "no mine",
          }[c.state];
          const scrambling = c.state === "pending" || (working && c.state === "sealed");
          return (
            <button
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="gridcell"
              tabIndex={i === focusIdx ? 0 : -1}
              aria-disabled={!can}
              className={`tile t-${c.state}${can ? " live" : ""}`}
              style={{ "--d": `${(row + col) * 32}ms` } as CSSProperties}
              aria-label={`${COLS[col]}${row + 1}, ${name}`}
              onFocus={() => setFocusIdx(i)}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => can && onOpen(i)}
            >
              <span className="face">
                {(c.state === "sealed" || c.state === "pending") && <Cipher fast={scrambling} still={reduced} />}
                {(c.state === "safe" || c.state === "clear") && <SafeMark />}
                {(c.state === "hit" || c.state === "mine") && <MineMark />}
                {c.state === "safe" && c.pts ? <span className="pts">+{c.pts}</span> : null}
              </span>
              {c.state === "hit" && !reduced && <span className="ring" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
