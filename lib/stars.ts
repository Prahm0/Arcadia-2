/**
 * Deterministic star generation. Coordinates are normalised (0–1) so a field
 * can be rendered at any size without re-seeding.
 */

export type Depth = 0 | 1 | 2; // 0 far, 1 mid, 2 near

export interface Star {
  x: number;
  y: number;
  /** Radius in CSS pixels. */
  r: number;
  /** Base opacity. */
  alpha: number;
  depth: Depth;
  /** Drift multiplier (0.5–1.5). */
  drift: number;
  /** Phase offset for the slow brightness cycle. */
  phase: number;
  /** Angular speed of the brightness cycle (rad/s). Periods of 15–45 s. */
  speed: number;
  purple: boolean;
  blur: boolean;
}

/** Small, fast, seedable PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOptions {
  count: number;
  seed?: number;
  /** Bias positions toward the centre of the canvas. */
  concentrate?: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function generateStars({
  count,
  seed = 7,
  concentrate = false,
}: GenerateOptions): Star[] {
  const rand = mulberry32(seed);
  const stars: Star[] = [];

  for (let i = 0; i < count; i++) {
    const roll = rand();
    const depth: Depth = roll < 0.62 ? 0 : roll < 0.9 ? 1 : 2;

    let x = rand();
    let y = rand();
    if (concentrate) {
      // Average of samples pulls the distribution toward the centre.
      x = (x + rand() + rand()) / 3;
      y = (y + rand() + rand()) / 3;
      x = lerp(0.5, x, 1.35);
      y = lerp(0.5, y, 1.35);
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
    }

    const r =
      depth === 0
        ? lerp(0.35, 0.75, rand())
        : depth === 1
          ? lerp(0.7, 1.15, rand())
          : lerp(1.1, 1.7, rand());

    const alpha =
      depth === 0
        ? lerp(0.1, 0.35, rand())
        : depth === 1
          ? lerp(0.25, 0.6, rand())
          : lerp(0.4, 0.8, rand());

    stars.push({
      x,
      y,
      r,
      alpha,
      depth,
      drift: lerp(0.5, 1.5, rand()),
      phase: rand() * Math.PI * 2,
      speed: lerp(0.14, 0.42, rand()),
      purple: rand() < 0.045,
      blur: depth === 2 && rand() < 0.45,
    });
  }

  return stars;
}

/** Parallax amplitude per depth layer, in CSS pixels. */
export const PARALLAX_PX: Record<Depth, number> = { 0: 3, 1: 7, 2: 12 };

/** Vertical drift per second as a fraction of canvas height. */
export const DRIFT_RATE: Record<Depth, number> = {
  0: 0.0006,
  1: 0.0012,
  2: 0.002,
};
