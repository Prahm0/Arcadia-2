"use client";

import Image from "next/image";

interface ArcadOrbProps {
  /** idle = gentle breathing; thinking = faster pulse; alert = warm accent ring. */
  state?: "idle" | "thinking" | "alert";
  /** Rendered pixel size. Actual glyph fills the box. */
  size?: number;
  className?: string;
}

/**
 * Arcad's living presence glyph. It uses the same rich constellation-orb
 * artwork as the brand mark, so the character students meet in chat is the
 * same one they recognise on their home screen.
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
      <Image
        src="/brand/arcad-orb-mark.png"
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        className="relative z-10 rounded-full object-cover"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    </span>
  );
}
