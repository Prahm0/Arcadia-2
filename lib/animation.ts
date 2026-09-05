import type { Transition, Variants } from "framer-motion";

/** Shared easing: soft, decisive, never elastic. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Shared durations in seconds. */
export const DUR = {
  micro: 0.2,
  entrance: 0.6,
  section: 0.9,
  cinematic: 1.6,
} as const;

export const VIEWPORT_ONCE = { once: true, amount: 0.35 } as const;
export const VIEWPORT_SOFT = { once: true, amount: 0.15 } as const;

export function ease(duration: number = DUR.entrance, delay = 0): Transition {
  return { duration, delay, ease: EASE_OUT };
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const staggerChildren = (stagger = 0.08, delay = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
});
