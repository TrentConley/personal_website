import { useEffect, useMemo, useState } from "react";

type TypewriterProps = {
  text: string;
  active: boolean;
  speed?: number;
};

const prefersReducedMotion = () => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export function Typewriter({ text, active, speed = 18 }: TypewriterProps) {
  const [display, setDisplay] = useState(active ? "" : text);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    if (!active || reduced) {
      setDisplay(text);
      return;
    }

    setDisplay("");
    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setDisplay(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(interval);
      }
    }, Math.max(10, speed));

    return () => window.clearInterval(interval);
  }, [text, active, speed, reduced]);

  return <span>{display}</span>;
}
