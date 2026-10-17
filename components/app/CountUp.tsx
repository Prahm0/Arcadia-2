"use client";

import { useEffect, useState } from "react";

const DURATION_MS = 380;

/** A number that counts up to its value when it first shows. Instant with reduced motion. */
export default function CountUp({ value, format = String }: { value: number; format?: (value: number) => string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    let start = 0;
    const step = (at: number) => {
      start ||= at;
      const t = Math.min(1, (at - start) / DURATION_MS);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(shown)}</>;
}
