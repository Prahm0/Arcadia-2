"use client";

import {
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  type MotionValue,
} from "framer-motion";
import { useEffect, useState, type RefObject } from "react";

type ScrollOffset = NonNullable<Parameters<typeof useScroll>[0]>["offset"];

/**
 * Scroll progress (0–1) of `target` through the viewport, as a plain motion
 * value. Framer's own `scrollYProgress` is tagged for native ViewTimeline
 * acceleration, which mis-maps `useTransform` keyframes for opacity; copying
 * it into an ordinary motion value keeps every derived value on the JS path.
 */
export function useScrollProgress(
  target: RefObject<HTMLElement | null>,
  offset: ScrollOffset = ["start start", "end end"],
): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target, offset });
  const progress = useMotionValue(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => progress.set(v));
  return progress;
}

/**
 * Subscribe to a media query. Returns `fallback` during SSR and the first
 * client render so markup matches the server.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(fallback);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 639px)");
}

/**
 * Reduced-motion preference, false during SSR and the first client render so
 * server and client markup match. Structural decisions should use this;
 * Framer's own transform suppression comes from MotionConfig.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
