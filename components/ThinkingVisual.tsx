"use client";

import { motion } from "framer-motion";
import { EASE_OUT } from "@/lib/animation";
import {
  ALL_EDGES,
  COLUMN_X,
  FOCUS_NODE,
  MOVED_NODE,
  NODE_POSITIONS,
  STAGE_EDGES,
  VIEW,
} from "@/lib/thinking";

interface ThinkingVisualProps {
  stage: number;
  reduced: boolean;
  className?: string;
}

const COLUMN_LABELS = ["Mon", "Tue", "Wed"];

/**
 * Abstract celestial view of the four stages: scattered points become an
 * ordered plan, one point moves and the plan re-forms, then attention
 * narrows to what matters now.
 */
export default function ThinkingVisual({ stage, reduced, className }: ThinkingVisualProps) {
  const positions = NODE_POSITIONS[stage];
  const activeEdges = new Set(STAGE_EDGES[stage].map((e) => `${e[0]}-${e[1]}`));
  const slow = { duration: reduced ? 0 : 1.4, ease: EASE_OUT };
  const medium = { duration: reduced ? 0 : 0.9, ease: EASE_OUT };

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      {/* System boundary — appears when Arcadia understands the whole picture. */}
      <motion.circle
        cx={VIEW / 2}
        cy={VIEW / 2}
        r={250}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.75}
        initial={false}
        animate={{ opacity: stage === 0 ? 1 : 0, scale: stage === 0 ? 1 : 1.04 }}
        style={{ transformOrigin: "center" }}
        transition={slow}
      />

      {/* Column labels — the plan takes the shape of a week. */}
      {COLUMN_LABELS.map((label, i) => (
        <motion.text
          key={label}
          x={COLUMN_X[i]}
          y={78}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize={12}
          letterSpacing={1}
          initial={false}
          animate={{ opacity: stage >= 1 ? (stage === 3 ? 0.4 : 1) : 0 }}
          transition={medium}
        >
          {label.toUpperCase()}
        </motion.text>
      ))}

      {/* Column guides */}
      {COLUMN_X.map((x, i) => (
        <motion.line
          key={i}
          x1={x}
          x2={x}
          y1={100}
          y2={560}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
          initial={false}
          animate={{ opacity: stage >= 1 ? 1 : 0 }}
          transition={medium}
        />
      ))}

      {/* Edges */}
      {ALL_EDGES.map(([a, b]) => {
        const key = `${a}-${b}`;
        const active = activeEdges.has(key);
        const purple = a === MOVED_NODE || b === MOVED_NODE;
        const dim = stage === 3;
        return (
          <motion.line
            key={key}
            initial={false}
            animate={{
              x1: positions[a][0],
              y1: positions[a][1],
              x2: positions[b][0],
              y2: positions[b][1],
              opacity: active ? (dim ? 0.3 : 1) : 0,
            }}
            transition={slow}
            stroke={purple ? "rgba(157,135,255,0.6)" : "rgba(255,255,255,0.22)"}
            strokeWidth={purple ? 1 : 0.8}
            strokeLinecap="round"
          />
        );
      })}

      {/* Nodes */}
      {positions.map(([x, y], i) => {
        const isMoved = i === MOVED_NODE && stage >= 2;
        const isFocus = i === FOCUS_NODE && stage === 3;
        const dim = stage === 3 && !isFocus;
        const fill = isFocus ? "#C6B8FF" : isMoved ? "#9D87FF" : "#FFFFFF";
        return (
          <g key={i}>
            {(isMoved || isFocus) && (
              <motion.circle
                initial={false}
                animate={{ cx: x, cy: y, opacity: isFocus ? 0.4 : 0.25 }}
                transition={slow}
                r={12}
                fill="rgba(124,92,255,1)"
                style={{ filter: "blur(7px)" }}
              />
            )}
            <motion.circle
              initial={false}
              animate={{
                cx: x,
                cy: y,
                r: isFocus ? 4.5 : stage === 0 ? 2.2 : 3,
                opacity: dim ? 0.28 : 1,
              }}
              transition={slow}
              fill={fill}
            />
            {isFocus && (
              <motion.circle
                cx={x}
                cy={y}
                fill="none"
                stroke="rgba(198,184,255,0.7)"
                strokeWidth={1}
                initial={{ r: 6, opacity: 0 }}
                animate={reduced ? { r: 16, opacity: 0.6 } : { r: [6, 22], opacity: [0.8, 0] }}
                transition={reduced ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: "easeOut" }}
              />
            )}
          </g>
        );
      })}

      {/* Annotations */}
      <motion.text
        x={positions[MOVED_NODE][0] + 14}
        y={positions[MOVED_NODE][1] + 4}
        fill="rgba(198,184,255,0.9)"
        fontSize={12}
        initial={false}
        animate={{ opacity: stage === 2 ? 1 : 0 }}
        transition={{ ...medium, delay: stage === 2 ? 0.9 : 0 }}
      >
        Moved
      </motion.text>
      <motion.text
        x={positions[FOCUS_NODE][0] - 16}
        y={positions[FOCUS_NODE][1] + 4}
        textAnchor="end"
        fill="rgba(255,255,255,0.85)"
        fontSize={12}
        initial={false}
        animate={{ opacity: stage === 3 ? 1 : 0 }}
        transition={{ ...medium, delay: stage === 3 ? 0.6 : 0 }}
      >
        Focus now
      </motion.text>
    </svg>
  );
}
