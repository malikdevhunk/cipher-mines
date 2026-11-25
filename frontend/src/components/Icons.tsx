/** Custom marks for Cipher Mines. Everything here is drawn for this game: no icon-font glyphs, no emoji. */

/** Logo: a 3 x 3 minefield with exactly one mine. */
export const Mark = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true" className="mark">
    {[0, 1, 2].flatMap((r) =>
      [0, 1, 2].map((c) => (
        <rect
          key={`${r}${c}`}
          x={2 + c * 9}
          y={2 + r * 9}
          width="7"
          height="7"
          rx="1.6"
          className={r === 1 && c === 1 ? "mark-mine" : "mark-cell"}
        />
      )),
    )}
  </svg>
);

/** A cleared cell: a sonar ring with a broken circle and a solid core. */
export const SafeMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="glyph">
    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    <path
      d="M12 3.2a8.8 8.8 0 0 1 8.8 8.8M12 20.8A8.8 8.8 0 0 1 3.2 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M20.8 12A8.8 8.8 0 0 1 12 20.8M3.2 12A8.8 8.8 0 0 1 12 3.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity=".28"
    />
  </svg>
);

/** A mine: a hazard diamond with a cut-out slot and dot. */
export const MineMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="glyph">
    <path
      fillRule="evenodd"
      fill="currentColor"
      d="M12 1.8 22.2 12 12 22.2 1.8 12 12 1.8Zm-1.2 5.4v6.4h2.4V7.2h-2.4Zm0 8.4v2.4h2.4v-2.4h-2.4Z"
    />
  </svg>
);

export const Lock = ({ open = false }: { open?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
    <rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path
      d={open ? "M8.5 10.5V7.8a3.5 3.5 0 0 1 6.8-1.2" : "M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

export const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
    <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
  </svg>
);

export const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
    <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="square" />
  </svg>
);

export const Close = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
    <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
  </svg>
);

export const Spinner = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico spin">
    <path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
