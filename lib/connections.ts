/**
 * Geometry for the "Everything connects" sequence. Each labelled node has
 * three states: scattered, clustered and its final place in a week grid.
 * Coordinates are normalised (0–1) within the drawing area.
 */

export interface ConnectionNode {
  id: string;
  label: string;
  /** Compact label for narrow screens. */
  short: string;
  scattered: [number, number];
  clustered: [number, number];
  /** Final schedule placement: day column (0–4) and vertical span (0–1). */
  grid: { day: number; y0: number; y1: number; wide?: boolean };
  purple?: boolean;
}

export const connectionNodes: ConnectionNode[] = [
  { id: "maths", label: "Maths test", short: "Maths test", scattered: [0.14, 0.22], clustered: [0.26, 0.34], grid: { day: 4, y0: 0.06, y1: 0.16 }, purple: true },
  { id: "english", label: "English assignment", short: "English", scattered: [0.72, 0.16], clustered: [0.36, 0.5], grid: { day: 2, y0: 0.62, y1: 0.74 } },
  { id: "school", label: "School", short: "School", scattered: [0.44, 0.34], clustered: [0.5, 0.2], grid: { day: 0, y0: 0.06, y1: 0.36, wide: true } },
  { id: "football", label: "Football training", short: "Football", scattered: [0.88, 0.48], clustered: [0.7, 0.42], grid: { day: 3, y0: 0.5, y1: 0.66 } },
  { id: "sleep", label: "Sleep", short: "Sleep", scattered: [0.2, 0.84], clustered: [0.52, 0.8], grid: { day: 0, y0: 0.9, y1: 0.98, wide: true } },
  { id: "friday", label: "Friday plans", short: "Friday", scattered: [0.62, 0.9], clustered: [0.76, 0.66], grid: { day: 4, y0: 0.6, y1: 0.86 } },
  { id: "chem", label: "Chemistry homework", short: "Chemistry", scattered: [0.08, 0.56], clustered: [0.24, 0.58], grid: { day: 1, y0: 0.46, y1: 0.58 } },
  { id: "calendar", label: "Calendar event", short: "Calendar", scattered: [0.5, 0.66], clustered: [0.66, 0.24], grid: { day: 1, y0: 0.7, y1: 0.8 } },
];

export const connectionEdges: Array<[number, number]> = [
  [0, 2], // maths test ↔ school
  [0, 6], // maths test ↔ chemistry (competing study time)
  [1, 5], // english ↔ friday plans
  [3, 4], // football ↔ sleep
  [3, 1], // football ↔ english
  [7, 5], // calendar ↔ friday plans
  [2, 4], // school ↔ sleep
  [6, 3], // chemistry ↔ football
  [7, 3], // calendar ↔ football
];

/** Unlabelled noise points that fade away as the picture organises. */
export const noisePoints: Array<[number, number]> = [
  [0.05, 0.1], [0.3, 0.08], [0.58, 0.06], [0.94, 0.12], [0.36, 0.2], [0.8, 0.3],
  [0.1, 0.4], [0.28, 0.44], [0.6, 0.46], [0.96, 0.62], [0.16, 0.7], [0.4, 0.78],
  [0.7, 0.76], [0.86, 0.86], [0.34, 0.94], [0.5, 0.5], [0.22, 0.3], [0.66, 0.58],
  [0.9, 0.7], [0.04, 0.9], [0.76, 0.06], [0.48, 0.16], [0.12, 0.66], [0.56, 0.84],
];

export const mobileNodeIds = new Set(["maths", "english", "school", "football", "sleep", "chem"]);

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
