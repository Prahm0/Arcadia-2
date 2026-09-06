"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";
import {
  DAY_NAMES,
  connectionEdges,
  connectionNodes,
  mobileNodeIds,
  noisePoints,
  type ConnectionNode,
} from "@/lib/connections";
import { useIsMobile, usePrefersReducedMotion, useScrollProgress } from "@/lib/hooks";
import { withAccent } from "./ui/RevealText";
import Container from "./ui/Container";
import SectionLabel from "./ui/SectionLabel";

/* Progress windows */
const DRAW = [0.14, 0.42] as const; // lines draw
const CLUSTER = [0.3, 0.58] as const; // nodes move into clusters
const NOISE_OUT = [0.36, 0.56] as const;
const GRID = [0.68, 0.9] as const; // structure becomes a week
const LINES_OUT = [0.66, 0.8] as const;
const HEADLINE_A = [0.03, 0.14, 0.5, 0.6] as const;
const HEADLINE_B = [0.6, 0.72] as const;
/** Phase captions shown bottom-left, keyed by the progress at which each begins. */
const CAPTIONS: Array<[number, string]> = [
  [0, "scattered"],
  [DRAW[0], "connected"],
  [CLUSTER[0] + 0.1, "structured"],
  [GRID[0], "your week"],
];

interface Layout {
  w: number;
  h: number;
  fontSize: number;
  gridTop: number;
  gridBottom: number;
  gridLeft: number;
  gridRight: number;
  dot: number;
  barH: number;
  /** Clamp for normalised x so labels stay inside narrow screens. */
  maxX: number;
  compact: boolean;
}

const DESKTOP: Layout = { w: 1200, h: 720, fontSize: 13, gridTop: 110, gridBottom: 700, gridLeft: 60, gridRight: 1140, dot: 3, barH: 40, maxX: 1, compact: false };
const MOBILE: Layout = { w: 390, h: 560, fontSize: 12, gridTop: 80, gridBottom: 540, gridLeft: 14, gridRight: 376, dot: 2.5, barH: 34, maxX: 0.64, compact: true };

function gridRect(node: ConnectionNode, L: Layout) {
  const colW = (L.gridRight - L.gridLeft) / 5;
  const x = L.gridLeft + node.grid.day * colW + 4;
  const w = node.grid.wide ? colW * 5 - 8 : colW - 8;
  const y = L.gridTop + node.grid.y0 * (L.gridBottom - L.gridTop);
  const h = Math.max(L.barH * 0.7, (node.grid.y1 - node.grid.y0) * (L.gridBottom - L.gridTop));
  return { x, y, w, h };
}

export default function ConnectionsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const isMobile = useIsMobile();
  const L = isMobile ? MOBILE : DESKTOP;

  const nodes = isMobile ? connectionNodes.filter((n) => mobileNodeIds.has(n.id)) : connectionNodes;
  const indexById = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = connectionEdges
    .map(([a, b]) => [connectionNodes[a].id, connectionNodes[b].id] as const)
    .filter(([a, b]) => indexById.has(a) && indexById.has(b))
    .map(([a, b]) => [indexById.get(a)!, indexById.get(b)!] as [number, number]);
  const noise = isMobile ? noisePoints.slice(0, 12) : noisePoints;

  const scrollYProgress = useScrollProgress(ref);

  const headlineAOpacity = useTransform(scrollYProgress, [...HEADLINE_A], [0, 1, 1, 0]);
  const headlineAY = useTransform(scrollYProgress, [HEADLINE_A[2], HEADLINE_A[3]], [0, -24]);
  const headlineBOpacity = useTransform(scrollYProgress, [...HEADLINE_B], [0, 1]);
  const headlineBY = useTransform(scrollYProgress, [...HEADLINE_B], [24, 0]);
  const gridOpacity = useTransform(scrollYProgress, [GRID[0] + 0.08, GRID[1]], [0, 1]);
  const noiseOpacity = useTransform(scrollYProgress, [...NOISE_OUT], [1, 0]);
  const caption = useTransform(scrollYProgress, (p) => {
    let label = CAPTIONS[0][1];
    for (const [at, text] of CAPTIONS) if (p >= at) label = text;
    return label;
  });
  const captionIndex = useTransform(scrollYProgress, (p) => {
    let i = 0;
    CAPTIONS.forEach(([at], idx) => {
      if (p >= at) i = idx;
    });
    return `0${i + 1}`;
  });

  if (reduced) {
    return (
      <section id="connections" aria-labelledby="connections-heading" className="section-seam bg-gradient-to-b from-dusk to-night-900 py-[120px] text-white lg:py-[160px]">
        <Container>
          <SectionLabel>Everything connects</SectionLabel>
          <h2 id="connections-heading" className="type-display mt-8 max-w-[900px]">
            {withAccent("Everything affects everything.", "everything.")}
          </h2>
          <p className="type-display mt-6 max-w-[900px] text-white/50">
            {withAccent("Arcadia sees the whole week.", "whole week.")}
          </p>
          <StaticPicture nodes={nodes} L={L} />
        </Container>
      </section>
    );
  }

  return (
    <section
      id="connections"
      aria-labelledby="connections-heading"
      className="section-seam bg-gradient-to-b from-dusk via-night-800 to-night-900 text-white"
    >
      <div ref={ref} className="relative h-[260vh]">
        <div className="sticky top-0 h-[100svh] overflow-hidden">
          <Container className="relative flex h-full flex-col pt-[100px] sm:pt-[120px]">
            <div className="relative z-10 h-[140px] sm:h-[160px]">
              <motion.h2
                id="connections-heading"
                style={{ opacity: headlineAOpacity, y: headlineAY }}
                className="type-display absolute inset-x-0 top-0 max-w-[900px]"
              >
                {withAccent("Everything affects everything.", "everything.")}
              </motion.h2>
              <motion.p
                style={{ opacity: headlineBOpacity, y: headlineBY }}
                className="type-display absolute inset-x-0 top-0 max-w-[900px]"
                aria-hidden="true"
              >
                {withAccent("Arcadia sees the whole week.", "whole week.")}
              </motion.p>
            </div>

            <div className="relative flex-1">
              <p
                aria-hidden="true"
                className="type-mono-label pointer-events-none absolute bottom-6 left-0 z-10 flex items-center gap-3 text-white/45"
              >
                <motion.span className="text-accent-200">{captionIndex}</motion.span>
                <motion.span>{caption}</motion.span>
              </p>
              <svg
                viewBox={`0 0 ${L.w} ${L.h}`}
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
              >
                {/* Week grid that the structure resolves into */}
                <motion.g style={{ opacity: gridOpacity }}>
                  {DAY_NAMES.map((d, i) => {
                    const colW = (L.gridRight - L.gridLeft) / 5;
                    const x = L.gridLeft + i * colW;
                    return (
                      <g key={d}>
                        <line x1={x} x2={x} y1={L.gridTop - 10} y2={L.gridBottom} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                        <text x={x + 10} y={L.gridTop - 22} fill="rgba(255,255,255,0.45)" fontSize={L.fontSize} letterSpacing={1}>
                          {d.toUpperCase()}
                        </text>
                      </g>
                    );
                  })}
                  <line x1={L.gridRight} x2={L.gridRight} y1={L.gridTop - 10} y2={L.gridBottom} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                </motion.g>

                {/* Noise: responsibilities that don't matter fade away */}
                <motion.g style={{ opacity: noiseOpacity }}>
                  {noise.map(([x, y], i) => (
                    <circle key={i} cx={x * L.w} cy={y * L.h} r={L.dot * 0.55} fill="rgba(255,255,255,0.35)" />
                  ))}
                </motion.g>

                {edges.map(([a, b], i) => (
                  <ConnectionEdge
                    key={`${a}-${b}`}
                    a={nodes[a]}
                    b={nodes[b]}
                    L={L}
                    progress={scrollYProgress}
                    order={i / edges.length}
                  />
                ))}

                {nodes.map((n, i) => (
                  <ConnectionMark key={n.id} node={n} L={L} progress={scrollYProgress} order={i / nodes.length} />
                ))}
              </svg>
            </div>
          </Container>
        </div>
      </div>
    </section>
  );
}

function center(node: ConnectionNode, L: Layout) {
  const r = gridRect(node, L);
  return {
    sx: Math.min(node.scattered[0], L.maxX) * L.w,
    sy: node.scattered[1] * L.h,
    cx: Math.min(node.clustered[0], L.maxX) * L.w,
    cy: node.clustered[1] * L.h,
    gx: r.x + r.w / 2,
    gy: r.y + r.h / 2,
  };
}

interface MarkProps {
  node: ConnectionNode;
  L: Layout;
  progress: MotionValue<number>;
  order: number;
}

function ConnectionMark({ node, L, progress, order }: MarkProps) {
  const c = center(node, L);
  const r = gridRect(node, L);
  const d = L.dot;

  const keys = [CLUSTER[0], CLUSTER[1], GRID[0], GRID[1]];
  const x = useTransform(progress, keys, [c.sx - d, c.cx - d, c.cx - d, r.x]);
  const y = useTransform(progress, keys, [c.sy - d, c.cy - d, c.cy - d, r.y]);
  const w = useTransform(progress, [GRID[0], GRID[1]], [d * 2, r.w]);
  const hgt = useTransform(progress, [GRID[0], GRID[1]], [d * 2, r.h]);
  const rx = useTransform(progress, [GRID[0], GRID[1]], [d, 6]);
  const fillOpacity = useTransform(progress, [GRID[0], GRID[1]], [1, node.purple ? 0.9 : 0.1]);
  const strokeOpacity = useTransform(progress, [GRID[0], GRID[1]], [0, node.purple ? 0 : 0.3]);

  const appear = 0.02 + order * 0.08;
  const opacity = useTransform(progress, [appear, appear + 0.08], [0, 1]);

  const labelX = useTransform(progress, keys, [c.sx + 12, c.cx + 12, c.cx + 12, r.x + 12]);
  const labelY = useTransform(progress, keys, [c.sy + 4, c.cy + 4, c.cy + 4, r.y + r.h / 2 + L.fontSize * 0.36]);
  const labelOpacity = useTransform(progress, [appear + 0.04, appear + 0.14], [0, 1]);

  const haloX = useTransform(x, (v) => v + d);
  const haloY = useTransform(y, (v) => v + d);
  const haloOpacity = useTransform(progress, [GRID[0], GRID[1]], [0.3, 0]);

  const fill = node.purple ? "#9D87FF" : "#FFFFFF";

  return (
    <motion.g style={{ opacity }}>
      {node.purple && (
        <motion.circle
          cx={haloX}
          cy={haloY}
          r={10}
          fill="rgba(124,92,255,1)"
          style={{ opacity: haloOpacity, filter: "blur(6px)" }}
        />
      )}
      <motion.rect
        x={x}
        y={y}
        width={w}
        height={hgt}
        rx={rx}
        fill={fill}
        stroke="#FFFFFF"
        strokeWidth={1}
        style={{ fillOpacity, strokeOpacity }}
      />
      <motion.text
        x={labelX}
        y={labelY}
        fill={node.purple ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.85)"}
        fontSize={L.fontSize}
        style={{ opacity: labelOpacity }}
      >
        {L.compact ? node.short : node.label}
      </motion.text>
    </motion.g>
  );
}

interface EdgeProps {
  a: ConnectionNode;
  b: ConnectionNode;
  L: Layout;
  progress: MotionValue<number>;
  order: number;
}

function ConnectionEdge({ a, b, L, progress, order }: EdgeProps) {
  const ca = center(a, L);
  const cb = center(b, L);
  const keys = [CLUSTER[0], CLUSTER[1]];

  const x1 = useTransform(progress, keys, [ca.sx, ca.cx]);
  const y1 = useTransform(progress, keys, [ca.sy, ca.cy]);
  const x2 = useTransform(progress, keys, [cb.sx, cb.cx]);
  const y2 = useTransform(progress, keys, [cb.sy, cb.cy]);

  const span = DRAW[1] - DRAW[0];
  const start = DRAW[0] + span * order * 0.6;
  const dashOffset = useTransform(progress, [start, start + span * 0.4], [1, 0]);
  const opacity = useTransform(progress, [...LINES_OUT], [1, 0]);

  const purple = Boolean(a.purple || b.purple);

  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      pathLength={1}
      strokeDasharray="1 1"
      style={{ strokeDashoffset: dashOffset, opacity }}
      stroke={purple ? "rgba(157,135,255,0.55)" : "rgba(255,255,255,0.22)"}
      strokeWidth={purple ? 1 : 0.8}
      strokeLinecap="round"
    />
  );
}

/** Reduced-motion fallback: the organised week, fully drawn. */
function StaticPicture({ nodes, L }: { nodes: ConnectionNode[]; L: Layout }) {
  return (
    <svg viewBox={`0 0 ${L.w} ${L.h}`} className="mt-16 w-full" aria-hidden="true">
      {DAY_NAMES.map((d, i) => {
        const colW = (L.gridRight - L.gridLeft) / 5;
        const x = L.gridLeft + i * colW;
        return (
          <g key={d}>
            <line x1={x} x2={x} y1={L.gridTop - 10} y2={L.gridBottom} stroke="rgba(255,255,255,0.08)" />
            <text x={x + 10} y={L.gridTop - 22} fill="rgba(255,255,255,0.45)" fontSize={L.fontSize} letterSpacing={1}>
              {d.toUpperCase()}
            </text>
          </g>
        );
      })}
      {nodes.map((n) => {
        const r = gridRect(n, L);
        return (
          <g key={n.id}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill={n.purple ? "#9D87FF" : "#FFFFFF"} fillOpacity={n.purple ? 0.9 : 0.1} stroke="#FFFFFF" strokeOpacity={n.purple ? 0 : 0.3} />
            <text x={r.x + 12} y={r.y + r.h / 2 + L.fontSize * 0.36} fill="rgba(255,255,255,0.9)" fontSize={L.fontSize}>
              {L.compact ? n.short : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
