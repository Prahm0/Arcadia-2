"use client";

import { motion, useTransform, type MotionStyle, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ConstellationNode, Edge } from "@/lib/constellation";
import { cn } from "@/lib/cn";

interface ConstellationProps {
  nodes: ConstellationNode[];
  edges: Edge[];
  /** Scroll or time progress, 0–1. */
  progress: MotionValue<number>;
  /** Progress window across which lines draw. */
  drawRange?: [number, number];
  /** Progress window across which nodes move from `from` to `to`. */
  moveRange?: [number, number];
  className?: string;
  style?: MotionStyle;
}

interface Size {
  w: number;
  h: number;
}

/**
 * A sparse set of "selected stars" that connect with hairline strokes and
 * drift toward organised positions as progress advances.
 */
export default function Constellation({
  nodes,
  edges,
  progress,
  drawRange = [0.2, 0.6],
  moveRange = [0.35, 0.8],
  className,
  style,
}: ConstellationProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [d0, d1] = drawRange;
  const span = d1 - d0;

  return (
    <motion.svg
      ref={ref}
      aria-hidden="true"
      className={cn("absolute inset-0 h-full w-full", className)}
      style={style}
      width={size.w || undefined}
      height={size.h || undefined}
    >
      {size.w > 0 &&
        edges.map(([a, b], i) => {
          const start = d0 + span * (i / edges.length) * 0.55;
          const end = Math.min(d1, start + span * 0.45);
          return (
            <EdgeLine
              key={`${a}-${b}`}
              a={nodes[a]}
              b={nodes[b]}
              progress={progress}
              size={size}
              moveRange={moveRange}
              range={[start, end]}
              purple={Boolean(nodes[a].purple || nodes[b].purple)}
            />
          );
        })}
      {size.w > 0 &&
        nodes.map((n, i) => (
          <NodeDot
            key={n.id}
            node={n}
            progress={progress}
            size={size}
            moveRange={moveRange}
            appearAt={d0 + span * 0.5 * (i / nodes.length)}
          />
        ))}
    </motion.svg>
  );
}

interface NodeDotProps {
  node: ConstellationNode;
  progress: MotionValue<number>;
  size: Size;
  moveRange: [number, number];
  appearAt: number;
}

function NodeDot({ node, progress, size, moveRange, appearAt }: NodeDotProps) {
  const cx = useTransform(progress, moveRange, [node.from[0] * size.w, node.to[0] * size.w]);
  const cy = useTransform(progress, moveRange, [node.from[1] * size.h, node.to[1] * size.h]);
  const opacity = useTransform(progress, [appearAt, appearAt + 0.1], [0, 1]);
  const haloOpacity = useTransform(progress, [appearAt, appearAt + 0.15], [0, 0.35]);

  return (
    <>
      {node.purple && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={7}
          fill="rgba(124,92,255,1)"
          style={{ opacity: haloOpacity, filter: "blur(4px)" }}
        />
      )}
      <motion.circle
        cx={cx}
        cy={cy}
        r={node.purple ? 2.2 : 1.7}
        fill={node.purple ? "#C6B8FF" : "#FFFFFF"}
        style={{ opacity }}
      />
    </>
  );
}

interface EdgeLineProps {
  a: ConstellationNode;
  b: ConstellationNode;
  progress: MotionValue<number>;
  size: Size;
  moveRange: [number, number];
  range: [number, number];
  purple: boolean;
}

function EdgeLine({ a, b, progress, size, moveRange, range, purple }: EdgeLineProps) {
  const x1 = useTransform(progress, moveRange, [a.from[0] * size.w, a.to[0] * size.w]);
  const y1 = useTransform(progress, moveRange, [a.from[1] * size.h, a.to[1] * size.h]);
  const x2 = useTransform(progress, moveRange, [b.from[0] * size.w, b.to[0] * size.w]);
  const y2 = useTransform(progress, moveRange, [b.from[1] * size.h, b.to[1] * size.h]);
  const dashOffset = useTransform(progress, range, [1, 0]);

  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      pathLength={1}
      strokeDasharray="1 1"
      style={{ strokeDashoffset: dashOffset }}
      stroke={purple ? "rgba(157,135,255,0.5)" : "rgba(255,255,255,0.22)"}
      strokeWidth={purple ? 1 : 0.75}
      strokeLinecap="round"
    />
  );
}
