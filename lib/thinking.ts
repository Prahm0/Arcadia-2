/** Content and geometry for the "How Arcadia thinks" sequence. */

export interface Stage {
  index: string;
  title: string;
  body: string;
}

export const stages: Stage[] = [
  {
    index: "01",
    title: "See the week",
    body: "Your school, deadlines, sport, work and commitments live in one plan.",
  },
  {
    index: "02",
    title: "Build the plan",
    body: "Arcadia turns what you need to do into study blocks you can follow.",
  },
  {
    index: "03",
    title: "Recover the week",
    body: "Tell Arcadia what changed and it rebuilds the part of your plan that needs to move.",
  },
  {
    index: "04",
    title: "Start next",
    body: "Your next study block is clear, so you can stop rearranging and start studying.",
  },
];

export type Point = [number, number];

export const VIEW = 600;

const COLS = [170, 300, 430];
const ROWS = [130, 230, 330, 430];

const grid = (c: number, r: number): Point => [COLS[c], ROWS[r]];

/** Node positions per stage (12 nodes, 4 stages). */
export const NODE_POSITIONS: Point[][] = [
  // 0, Understand: scattered, loosely inside the system boundary.
  [
    [120, 150], [460, 110], [300, 90], [520, 300],
    [90, 330], [380, 240], [220, 260], [470, 470],
    [150, 480], [330, 520], [250, 400], [400, 380],
  ],
  // 1, Plan: three ordered columns.
  [
    grid(0, 0), grid(0, 1), grid(0, 2), grid(0, 3),
    grid(1, 0), grid(1, 1), grid(1, 2), grid(1, 3),
    grid(2, 0), grid(2, 1), grid(2, 2), grid(2, 3),
  ],
  // 2, Adapt: node 5 moves to the end of the third column; its column closes up.
  [
    grid(0, 0), grid(0, 1), grid(0, 2), grid(0, 3),
    grid(1, 0), [COLS[2], 530], grid(1, 1), grid(1, 2),
    grid(2, 0), grid(2, 1), grid(2, 2), grid(2, 3),
  ],
  // 3, Guide: same structure, attention narrows to one node.
  [
    grid(0, 0), grid(0, 1), grid(0, 2), grid(0, 3),
    grid(1, 0), [COLS[2], 530], grid(1, 1), grid(1, 2),
    grid(2, 0), grid(2, 1), grid(2, 2), grid(2, 3),
  ],
];

export type EdgeKey = `${number}-${number}`;

export const STAGE_EDGES: Array<Array<[number, number]>> = [
  [],
  [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [8, 9], [9, 10], [10, 11]],
  [[0, 1], [1, 2], [2, 3], [4, 6], [6, 7], [8, 9], [9, 10], [10, 11], [11, 5]],
  [[0, 1], [1, 2], [2, 3], [4, 6], [6, 7], [8, 9], [9, 10], [10, 11], [11, 5]],
];

export const ALL_EDGES: Array<[number, number]> = Array.from(
  new Map(STAGE_EDGES.flat().map((e) => [`${e[0]}-${e[1]}`, e])).values(),
);

export const MOVED_NODE = 5;
export const FOCUS_NODE = 0;
export const COLUMN_X = COLS;
