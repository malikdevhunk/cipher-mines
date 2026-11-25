export const Gem = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true" className="ico gem">
    <path d="M9 6h14l6 7-13 14L3 13z" fill="currentColor" opacity=".18" />
    <path
      d="M9 6h14l6 7-13 14L3 13z M3 13h26 M9 6l4 7 3 14 3-14 4-7 M13 13l3-7 3 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export const Mine = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true" className="ico mine">
    <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M16 3v5M16 24v5M3 16h5M24 16h5M6.8 6.8l3.5 3.5M21.7 21.7l3.5 3.5M6.8 25.2l3.5-3.5M21.7 10.3l3.5-3.5" />
    </g>
    <circle cx="16" cy="16" r="7.5" fill="currentColor" />
    <circle cx="13.5" cy="13.5" r="2" fill="#fff" opacity=".55" />
  </svg>
);

export const Lock = ({ open = false }: { open?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico lock">
    <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path
      d={open ? "M8.5 10.5V7.8a3.5 3.5 0 0 1 6.8-1.2" : "M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <circle cx="12" cy="15.4" r="1.4" fill="currentColor" />
  </svg>
);

export const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
    <path
      d="M5 12.5l4.2 4.2L19 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">
    <path
      d="M7 17L17 7M9 7h8v8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Mark = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true" className="mark">
    {[0, 1, 2].flatMap((r) =>
      [0, 1, 2].map((c) => (
        <rect
          key={`${r}${c}`}
          x={4 + c * 8.6}
          y={4 + r * 8.6}
          width="6.6"
          height="6.6"
          rx="1.6"
          fill="currentColor"
          opacity={r === c ? 1 : 0.28}
        />
      )),
    )}
  </svg>
);
