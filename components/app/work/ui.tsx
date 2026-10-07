"use client";

import type { ReactNode } from "react";
import { BAND_LABELS, type Band } from "@/shared/mastery";

/** A colour from the palette, put on the label itself (never a dot beside it). */
export function ToneTag({ tone, children, size = "md" }: { tone: string | null; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-[4px] font-medium " +
        (size === "sm" ? "px-1.5 py-px text-[11.5px]" : "px-1.5 py-0.5 text-[12px]")
      }
      style={
        tone
          ? {
              color: `color-mix(in oklab, ${tone} 75%, var(--app-text))`,
              background: `color-mix(in oklab, ${tone} 13%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tone} 30%, transparent)`,
            }
          : { color: "var(--app-text-muted)", background: "var(--app-surface-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }
      }
    >
      {children}
    </span>
  );
}

export const BAND_TONES: Record<Band, string | null> = {
  strong: "var(--app-success)",
  weak: "var(--app-warning)",
  neglected: "var(--app-danger)",
  none: null,
};

export function BandTag({ band, size }: { band: Band; size?: "sm" | "md" }) {
  return (
    <ToneTag tone={BAND_TONES[band]} size={size}>
      {BAND_LABELS[band]}
    </ToneTag>
  );
}

/** The marking rubric's levels, in the student's words. */
export function qualityLabel(quality: number | null): { label: string; tone: string | null } {
  if (quality === null) return { label: "Added by you", tone: null };
  if (quality >= 100) return { label: "Spot on", tone: "var(--app-success)" };
  if (quality >= 75) return { label: "Small slips", tone: "var(--app-success)" };
  if (quality >= 50) return { label: "Partly there", tone: "var(--app-warning)" };
  if (quality >= 25) return { label: "Shaky", tone: "var(--app-danger)" };
  return { label: "Not yet", tone: "var(--app-danger)" };
}

/** "MM-3.2.1.4" → "3.2.1.4": the subject's already on screen. */
export function shortPointId(id: string): string {
  return id.replace(/^[A-Z]+-/, "");
}
