"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type Point = { x: number; y: number };

const MOVE_MS = 520;
const FADE_MS = 320;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * A key that changes only when blocks actually move, are added or removed.
 * Pass it to useFlip rather than an array, which can be a new object on every
 * render (and would replay the animation during a drag).
 */
export function flipKey(events: ReadonlyArray<{ id: string; startAt: string; endAt: string }>): string {
  return events.map((event) => `${event.id}@${event.startAt}-${event.endAt}`).sort().join("|");
}

function measure(root: HTMLElement): Map<string, Point> {
  const origin = root.getBoundingClientRect();
  const positions = new Map<string, Point>();
  root.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((element) => {
    const rect = element.getBoundingClientRect();
    positions.set(element.dataset.flipId!, { x: rect.left - origin.left, y: rect.top - origin.top });
  });
  return positions;
}

/**
 * Slides blocks into their new places when the plan changes (an Arcad
 * replan, a rebuild) instead of letting them jump. Elements opt in with a
 * `data-flip-id` attribute under `root`; `root` should scroll with them, so
 * positions are measured relative to it and scrolling never counts as a move.
 *
 * Positions are re-measured after every commit and on resize, so only a
 * change of `key` animates: a moved block plays from where it was, a new
 * one fades in. Nothing animates under prefers-reduced-motion. When `scope`
 * changes (another day or week is on screen) positions are only re-measured.
 */
export function useFlip(root: RefObject<HTMLElement | null>, key: string, scope = ""): void {
  const positions = useRef<Map<string, Point> | null>(null);
  const lastKey = useRef(key);
  const lastScope = useRef(scope);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const next = measure(element);
    const previous = positions.current;
    const changed = lastKey.current !== key && lastScope.current === scope;
    lastKey.current = key;
    lastScope.current = scope;
    positions.current = next;
    if (!changed || !previous) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    element.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((block) => {
      if (typeof block.animate !== "function") return;
      const id = block.dataset.flipId!;
      const now = next.get(id);
      const before = previous.get(id);
      if (!now) return;
      if (!before) {
        const opacity = getComputedStyle(block).opacity;
        block.animate([{ opacity: 0 }, { opacity }], { duration: FADE_MS, easing: EASE });
        return;
      }
      const dx = before.x - now.x;
      const dy = before.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      block.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: MOVE_MS,
        easing: EASE,
      });
    });
  });

  // A resize moves everything without a plan change; take the new positions quietly.
  useEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      positions.current = measure(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);
}
