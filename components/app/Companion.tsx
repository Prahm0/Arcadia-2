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
  level?: number; // 1..4 (from backend, derived from focus minutes)
  state?: "ready" | "recovering";
  size?: number;
  animated?: boolean;
  className?: string;
}

const PALETTES: Record<CompanionPalette, { core: string; halo: string; accent: string }> = {
  violet: { core: "#9d87ff", halo: "#7c5cff", accent: "#c6b8ff" },
  aqua:   { core: "#7cd6ff", halo: "#38bdf8", accent: "#bde6ff" },
  coral:  { core: "#ff9c76", halo: "#f97316", accent: "#ffcbaf" },
  gold:   { core: "#f5c15a", halo: "#eab308", accent: "#f5dfa0" },
};

/**
 * The student's companion, rendered as a constellation-style SVG that matches
 * the landing page's mark language. Form / palette / accessory come from the
 * backend companion profile; level scales the surrounding star density and
 * state ("recovering") mutes the whole glyph so a rough week reads honestly.
 *
 * Deterministic — no randomness in placement, so the companion looks the same
 * on every render. Reduced-motion viewers get a static image (animation lives
 * in a global keyframe that opts out).
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
  const colors = PALETTES[palette];
  const opacity = state === "recovering" ? 0.6 : 1;
  const glyph =
    form === "comet"
      ? renderComet(colors, level)
      : form === "nebula"
        ? renderNebula(colors, level)
        : renderOrb(colors, level);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size, opacity }}
      aria-hidden="true"
    >
      {animated ? (
        <span
          className="arcadia-orb-pulse"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `radial-gradient(circle at 50% 50%, ${colors.halo}88 0%, transparent 68%)`,
            filter: "blur(2px)",
            opacity: 0.4,
          }}
        />
      ) : null}
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: "relative", zIndex: 1 }}>
        {glyph}
        {renderAccessory(accessory, colors)}
      </svg>
    </span>
  );
}

function renderOrb(colors: { core: string; halo: string; accent: string }, level: number) {
  const stars = starPositions(level);
  return (
    <>
      <circle cx="50" cy="50" r="22" fill={colors.core} opacity="0.85" />
      <circle cx="50" cy="50" r="22" fill="none" stroke={colors.halo} strokeWidth="1.5" opacity="0.5" />
      <circle cx="43" cy="43" r="6" fill="white" opacity="0.55" />
      {stars.map((s, i) => (
        <FourPointStar key={i} cx={s.x} cy={s.y} size={s.size} color={colors.accent} />
      ))}
    </>
  );
}

function renderComet(colors: { core: string; halo: string; accent: string }, level: number) {
  const stars = starPositions(level, 0.7);
  return (
    <>
      {/* Trailing tail */}
      <defs>
        <linearGradient id={`comet-tail-${colors.core.replace("#", "")}`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={colors.core} stopOpacity="0" />
          <stop offset="100%" stopColor={colors.halo} stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path
        d="M50 50 Q30 62, 12 82 L18 84 Q35 66, 55 55 Z"
        fill={`url(#comet-tail-${colors.core.replace("#", "")})`}
        opacity="0.75"
      />
      <circle cx="55" cy="45" r="18" fill={colors.core} opacity="0.92" />
      <circle cx="55" cy="45" r="18" fill="none" stroke={colors.halo} strokeWidth="1.4" opacity="0.55" />
      <circle cx="49" cy="39" r="5" fill="white" opacity="0.55" />
      {stars.map((s, i) => (
        <FourPointStar key={i} cx={s.x} cy={s.y} size={s.size} color={colors.accent} />
      ))}
    </>
  );
}

function renderNebula(colors: { core: string; halo: string; accent: string }, level: number) {
  const stars = starPositions(level, 1.4);
  return (
    <>
      {/* Cluster core (three overlapping soft blobs) */}
      <circle cx="42" cy="46" r="14" fill={colors.core} opacity="0.5" />
      <circle cx="60" cy="48" r="16" fill={colors.halo} opacity="0.5" />
      <circle cx="50" cy="60" r="12" fill={colors.accent} opacity="0.55" />
      <FourPointStar cx={42} cy={46} size={5} color="white" />
      <FourPointStar cx={60} cy={48} size={5} color="white" />
      <FourPointStar cx={50} cy={60} size={4} color="white" />
      {stars.map((s, i) => (
        <FourPointStar key={i} cx={s.x} cy={s.y} size={s.size} color={colors.accent} />
      ))}
    </>
  );
}

function renderAccessory(
  accessory: CompanionAccessory,
  colors: { core: string; halo: string; accent: string },
) {
  if (accessory === "none") return null;
  if (accessory === "ring") {
    return (
      <ellipse
        cx="50"
        cy="52"
        rx="34"
        ry="9"
        fill="none"
        stroke={colors.accent}
        strokeWidth="2"
        transform="rotate(-14 50 52)"
        opacity="0.75"
      />
    );
  }
  if (accessory === "star") {
    return <FourPointStar cx={78} cy={22} size={9} color="white" />;
  }
  if (accessory === "book") {
    return (
      <g transform="translate(50 78)" opacity="0.9">
        <rect x="-9" y="-4" width="18" height="10" rx="1" fill={colors.accent} />
        <path d="M-9 -4 L0 0 L9 -4 L0 2 Z" fill={colors.halo} opacity="0.7" />
      </g>
    );
  }
  if (accessory === "headphones") {
    return (
      <g fill="none" stroke={colors.accent} strokeWidth="2.2" strokeLinecap="round">
        <path d="M30 42 Q30 22, 50 22 Q70 22, 70 42" />
        <rect x="26" y="40" width="8" height="12" rx="2" fill={colors.accent} />
        <rect x="66" y="40" width="8" height="12" rx="2" fill={colors.accent} />
      </g>
    );
  }
  return null;
}

function FourPointStar({ cx, cy, size, color }: { cx: number; cy: number; size: number; color: string }) {
  const s = size / 2;
  const arm = size / 8;
  const path = `M ${cx} ${cy - s} L ${cx + arm} ${cy - arm} L ${cx + s} ${cy} L ${cx + arm} ${cy + arm} L ${cx} ${cy + s} L ${cx - arm} ${cy + arm} L ${cx - s} ${cy} L ${cx - arm} ${cy - arm} Z`;
  return <path d={path} fill={color} />;
}

interface StarSpec {
  x: number;
  y: number;
  size: number;
}

/** Deterministic star ring around the core — density scales with level. */
function starPositions(level: number, scale: number = 1): StarSpec[] {
  const count = Math.min(12, 2 + level * 2);
  const stars: StarSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + Math.PI / 6;
    const radius = 34 + (i % 2 === 0 ? 4 : 0);
    const x = 50 + Math.cos(angle) * radius * scale;
    const y = 50 + Math.sin(angle) * radius * scale;
    stars.push({ x, y, size: i % 3 === 0 ? 4 : 3 });
  }
  return stars;
}
