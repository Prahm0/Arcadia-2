"use client";

interface ArcadOrbProps {
  /** idle = gentle breathing; thinking = faster pulse; alert = warm accent ring. */
  state?: "idle" | "thinking" | "alert";
  /** Rendered pixel size. Actual glyph fills the box. */
  size?: number;
  className?: string;
}

/**
 * Arcad's living presence glyph. The companion mirrors the constellation-orb
 * brand mark, but stays inline so it remains sharp and expressive at chat
 * avatar size. Its states give planning, waiting and recovery moments a
 * little warmth without turning the interface into a cartoon.
 */
export default function ArcadOrb({ state = "idle", size = 40, className }: ArcadOrbProps) {
  const pulseClass =
    state === "thinking" ? "arcadia-orb-pulse-fast" : state === "alert" ? "arcadia-orb-pulse-alert" : "arcadia-orb-pulse";
  const ringOpacity = state === "alert" ? 0.55 : 0.32;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Aurora glow that breathes with the pulse class. */}
      <span
        className={pulseClass}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--app-arcad) 55%, transparent) 0%, transparent 68%)`,
          filter: "blur(1px)",
          opacity: ringOpacity,
        }}
      />
      {/* A tiny orbit makes the companion read as Arcad, even at avatar size. */}
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        style={{ position: "relative", zIndex: 1 }}
        aria-hidden="true"
      >
        <ellipse cx="12" cy="12" rx="9.3" ry="3.6" stroke="var(--app-arcad)" strokeWidth="0.8" opacity={state === "thinking" ? 0.82 : 0.55} transform="rotate(-24 12 12)" />
        <circle cx="12" cy="12" r="7.25" fill="var(--app-arcad)" />
        <circle cx="9.45" cy="11.55" r="0.76" fill="#171027" />
        <circle cx="14.55" cy="11.55" r="0.76" fill="#171027" />
        {state === "thinking" ? (
          <path d="M10 14.45c1.05-.72 2.95-.72 4 0" stroke="#171027" strokeWidth="0.82" strokeLinecap="round" />
        ) : state === "alert" ? (
          <path d="M10.25 14.4c1.15.96 2.35.96 3.5 0" stroke="#171027" strokeWidth="0.82" strokeLinecap="round" />
        ) : (
          <path d="M10.1 14.05c1.1.88 2.7.88 3.8 0" stroke="#171027" strokeWidth="0.82" strokeLinecap="round" />
        )}
        <path
          d="M18.6 5.1l.35 1.35 1.35.35-1.35.35-.35 1.35-.35-1.35-1.35-.35 1.35-.35.35-1.35Z"
          fill="#FFF4D6"
        />
      </svg>
    </span>
  );
}
