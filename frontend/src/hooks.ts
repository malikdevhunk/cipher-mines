import { useEffect, useState } from "react";

/** Live `prefers-reduced-motion` flag so JS-driven loops can stop, not just CSS. */
export function useReducedMotion(): boolean {
  const q = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}
