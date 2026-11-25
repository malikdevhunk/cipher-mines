import { useEffect, useState, type CSSProperties } from "react";
import { GRID } from "../config";
import { Gem, Mine } from "./Icons";

export type CellState = "sealed" | "pending" | "safe" | "hit" | "mine" | "clear";
export type Cell = { state: CellState; pts?: number };

const HEX = "0123456789abcdef";
const hex2 = () => HEX[(Math.random() * 16) | 0] + HEX[(Math.random() * 16) | 0];
const COLS = ["A", "B", "C", "D", "E"];

/** Sealed tiles show a slowly drifting ciphertext byte; pending tiles scramble fast. */
function Cipher({ fast }: { fast: boolean }) {
  const [v, setV] = useState(hex2);
  useEffect(() => {
    const id = setInterval(() => setV(hex2()), fast ? 70 : 1600 + Math.random() * 2400);
    return () => clearInterval(id);
  }, [fast]);
  return <span className="cipher">{v}</span>;
}

type Props = {
  cells: Cell[];
  interactive: boolean;
  onOpen: (i: number) => void;
  shake: boolean;
  dim: boolean;
};

export function Board({ cells, interactive, onOpen, shake, dim }: Props) {
  return (
    <div className={`plate ${shake ? "shake" : ""} ${dim ? "dim" : ""}`}>
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
      <div className="grid" role="grid" aria-label="Minefield, 5 by 5">
        {cells.map((c, i) => {
          const row = Math.floor(i / GRID),
            col = i % GRID;
          const can = interactive && c.state === "sealed";
          const label = `${COLS[col]}${row + 1}: ${c.state === "sealed" ? "sealed" : c.state}`;
          return (
            <button
              key={i}
              role="gridcell"
              className={`tile t-${c.state}`}
              style={{ "--d": `${(row + col) * 35}ms` } as CSSProperties}
              disabled={!can}
              aria-label={label}
              onClick={() => can && onOpen(i)}
            >
              <span className="face">
                {(c.state === "sealed" || c.state === "pending") && <Cipher fast={c.state === "pending"} />}
                {(c.state === "safe" || c.state === "clear") && <Gem />}
                {(c.state === "hit" || c.state === "mine") && <Mine />}
                {c.state === "safe" && c.pts ? <span className="pts">+{c.pts}</span> : null}
              </span>
              {c.state === "hit" && <span className="ring" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
