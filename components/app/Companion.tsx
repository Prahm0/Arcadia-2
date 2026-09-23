"use client";

import type {
  CompanionAccessory,
  CompanionForm,
  CompanionPalette,
} from "@/lib/api/types";

interface CompanionProps {
  form?: CompanionForm;
  palette?: CompanionPalette;
  accessory?: CompanionAccessory;
  level?: number; // 1..4, from all-time focus minutes
  state?: "ready" | "recovering";
  size?: number;
  animated?: boolean;
  className?: string;
}

const PALETTES: Record<CompanionPalette, string> = {
  violet: "#8b72f0",
  aqua: "#3aa9d8",
  coral: "#e8794f",
  gold: "#d4a23a",
};

type Point = [number, number];

/**
 * Each form is a constellation of eight stars, listed in the order they
 * light up. The first is the companion's own star; the rest arrive with
 * focus time, so a new student sees a few stars and the outline of the rest.
 */
const SHAPES: Record<CompanionForm, { points: Point[]; edges: Array<[number, number]> }> = {
  // A loose ring, closing once every star is lit.
  orb: {
    points: [[50, 18], [74, 28], [82, 52], [70, 76], [46, 82], [24, 70], [18, 46], [30, 25]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]],
  },
  // An arc, bright at the head, the tail growing behind it.
  comet: {
    points: [[78, 22], [68, 32], [60, 42], [51, 51], [42, 59], [33, 66], [24, 73], [15, 80]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
  },
  // A cluster branching out from the middle.
  nebula: {
    points: [[50, 50], [34, 40], [66, 38], [44, 68], [64, 64], [22, 58], [56, 20], [80, 52]],
    edges: [[0, 1], [0, 2], [0, 3], [3, 4], [1, 5], [2, 6], [4, 7]],
  },
};

/** How many of the eight stars are lit at each level. */
const LIT = [3, 5, 7, 8];

/**
 * The student's companion: a small constellation, drawn in hairlines like the
 * landing page's star maps. Level lights more of it; unlit stars stay as
 * faint points so there's always something to grow into. "Recovering" dims
 * the whole thing after a rough patch.
 */
export default function Companion({
  form = "orb",
  palette = "violet",
  accessory = "none",
  level = 1,
  state = "ready",
  size = 96,
  animated = true,
  className,
}: CompanionProps) {
  const colour = PALETTES[palette];
  const shape = SHAPES[form] ?? SHAPES.orb;
  const lit = LIT[Math.max(1, Math.min(4, Math.round(level))) - 1];
  const detail = size < 88 ? 1.5 : 1.15; // heavier when it's drawn small

  return (
    <span
      className={`relative inline-flex shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size, opacity: state === "recovering" ? 0.55 : 1 }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width={size} height={size} fill="none">
        {shape.edges.map(([from, to]) => {
          const on = from < lit && to < lit;
          const [x1, y1] = shape.points[from];
          const [x2, y2] = shape.points[to];
          return (
            <line
              key={`${from}-${to}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={on ? colour : "var(--app-border-strong)"}
              strokeOpacity={on ? 0.55 : 0.7}
              strokeWidth={1.1 * detail}
              strokeDasharray={on ? undefined : "1.5 3"}
              strokeLinecap="round"
            />
          );
        })}
        {shape.points.map(([x, y], index) =>
          index === 0 ? null : (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={(index < lit ? 2.6 : 1.5) * detail}
              fill={index < lit ? colour : "var(--app-border-strong)"}
            />
          ),
        )}
        <g className={animated ? "companion-twinkle" : undefined} style={{ transformOrigin: `${shape.points[0][0]}px ${shape.points[0][1]}px` }}>
          <Sparkle x={shape.points[0][0]} y={shape.points[0][1]} size={15 * detail} colour={colour} />
        </g>
        <Accessory kind={accessory} colour={colour} />
      </svg>
    </span>
  );
}

function Sparkle({ x, y, size, colour }: { x: number; y: number; size: number; colour: string }) {
  const s = size / 2;
  const w = size / 7;
  return (
    <>
      <circle cx={x} cy={y} r={s * 0.95} fill={colour} opacity="0.14" />
      <path
        d={`M${x} ${y - s}Q${x + w} ${y - w} ${x + s} ${y}Q${x + w} ${y + w} ${x} ${y + s}Q${x - w} ${y + w} ${x - s} ${y}Q${x - w} ${y - w} ${x} ${y - s}Z`}
        fill={colour}
      />
    </>
  );
}

function Accessory({ kind, colour }: { kind: CompanionAccessory; colour: string }) {
  const line = { stroke: colour, strokeOpacity: 0.7, strokeWidth: 1.3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "ring":
      return <ellipse cx="50" cy="50" rx="46" ry="14" transform="rotate(-18 50 50)" {...line} strokeOpacity={0.35} />;
    case "star":
      return <Sparkle x={88} y={12} size={9} colour={colour} />;
    case "book":
      return <path d="M76 86v-9c3-1.5 6-1.5 8 0 2-1.5 5-1.5 8 0v9c-3-1.5-6-1.5-8 0-2-1.5-5-1.5-8 0zM84 77v9" {...line} />;
    case "headphones":
      return <path d="M34 22a18 18 0 0 1 32 0M31 21v6M69 21v6" {...line} />;
    default:
      return null;
  }
}
