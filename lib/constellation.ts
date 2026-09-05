/**
 * Deterministic constellation data. Positions are normalised (0–1) within
 * the containing element. `from` is the scattered state, `to` the organised
 * state the nodes settle into.
 */

export interface ConstellationNode {
  id: string;
  from: [number, number];
  to: [number, number];
  purple?: boolean;
}

export type Edge = [number, number];

export const heroNodes: ConstellationNode[] = [
  { id: "a", from: [0.12, 0.2], to: [0.3, 0.3] },
  { id: "b", from: [0.3, 0.11], to: [0.4, 0.3] },
  { id: "c", from: [0.55, 0.08], to: [0.5, 0.3] },
  { id: "d", from: [0.8, 0.14], to: [0.6, 0.3] },
  { id: "e", from: [0.92, 0.3], to: [0.7, 0.3] },
  { id: "f", from: [0.88, 0.72], to: [0.7, 0.55] },
  { id: "g", from: [0.7, 0.88], to: [0.6, 0.55] },
  { id: "h", from: [0.45, 0.92], to: [0.5, 0.55] },
  { id: "i", from: [0.22, 0.84], to: [0.4, 0.55] },
  { id: "j", from: [0.08, 0.62], to: [0.3, 0.55] },
  { id: "k", from: [0.35, 0.74], to: [0.4, 0.74], purple: true },
  { id: "l", from: [0.66, 0.26], to: [0.6, 0.74] },
];

export const heroEdges: Edge[] = [
  [0, 1],
  [1, 2],
  [3, 4],
  [5, 6],
  [7, 8],
  [8, 9],
  [2, 11],
  [11, 5],
  [10, 8],
  [10, 7],
  [3, 11],
];

/** Fewer nodes for small screens. */
export const heroNodesMobile: ConstellationNode[] = [
  { id: "a", from: [0.1, 0.16], to: [0.3, 0.28] },
  { id: "c", from: [0.6, 0.07], to: [0.5, 0.28] },
  { id: "e", from: [0.92, 0.26], to: [0.7, 0.28] },
  { id: "f", from: [0.86, 0.8], to: [0.7, 0.55] },
  { id: "h", from: [0.4, 0.9], to: [0.5, 0.55] },
  { id: "j", from: [0.08, 0.66], to: [0.3, 0.55] },
  { id: "k", from: [0.3, 0.8], to: [0.4, 0.74], purple: true },
  { id: "l", from: [0.72, 0.3], to: [0.6, 0.74] },
];

export const heroEdgesMobile: Edge[] = [
  [0, 1],
  [1, 2],
  [3, 4],
  [4, 5],
  [6, 4],
  [7, 3],
  [1, 7],
];
