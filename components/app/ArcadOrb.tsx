"use client";

interface ArcadOrbProps {
  /** idle = gentle breathing; thinking = faster pulse; alert = warm accent ring. */
  state?: "idle" | "thinking" | "alert";
  /** Rendered pixel size. Actual glyph fills the box. */
  size?: number;
  className?: string;
}

/**
 * Arcad's presence glyph. A four-point constellation star nested inside a soft
 * aurora ring, rendered inline (no external asset). It has three states so
 * the same shape can serve as a hero mark, a message-bubble bullet, or a
 * status indicator when Arcad is composing a reply.
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
      {/* Aurora ring — a soft radial glow that breathes with the pulse class. */}
      <span
        className={pulseClass}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--app-accent) 55%, transparent) 0%, transparent 68%)`,
          filter: "blur(1px)",
          opacity: ringOpacity,
        }}
      />
      {/* Core disc — subtle but distinct so the star reads on any surface. */}
      <span
        style={{
          position: "absolute",
          inset: "22%",
          borderRadius: "50%",
          background: "color-mix(in oklab, var(--app-accent) 18%, var(--app-surface))",
          border: "1px solid color-mix(in oklab, var(--app-accent) 40%, var(--app-border))",
        }}
      />
      {/* Four-point star matching the landing page's mark. */}
      <svg
        viewBox="0 0 24 24"
        width={size * 0.5}
        height={size * 0.5}
        fill="none"
        style={{ position: "relative", zIndex: 1 }}
        aria-hidden="true"
      >
        <path
          d="M12 2 L13.6 10.4 L22 12 L13.6 13.6 L12 22 L10.4 13.6 L2 12 L10.4 10.4 Z"
          fill="var(--app-accent)"
        />
      </svg>
    </span>
  );
}
