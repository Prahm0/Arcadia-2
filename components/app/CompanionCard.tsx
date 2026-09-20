"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { CompanionProfile } from "@/lib/api/types";
import Companion from "./Companion";
import CompanionSheet from "./CompanionSheet";

/**
 * A small sidebar tile that shows the student's companion, their name, level,
 * and current mood ("Ready" / "Recovering"). Click opens the customisation
 * sheet.
 */
export default function CompanionCard() {
  const { data } = useDashboardData();
  const [sheetOpen, setSheetOpen] = useState(false);

  const companion = data.companion;
  const profile = normalizeProfile(companion?.profile);
  const level = Number(companion?.level ?? 1);
  const state = companion?.state === "recovering" ? "recovering" : "ready";
  const focusedMinutes = Number(companion?.focusedMinutes ?? 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="w-full rounded-[14px] p-5 text-left transition-colors hover:bg-black/[0.02]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
      >
        <div className="flex items-center gap-4">
          <Companion
            form={profile.form}
            palette={profile.palette}
            accessory={profile.accessory}
            level={level}
            state={state}
            size={72}
          />
          <div className="min-w-0 flex-1">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
              Companion · Level {Math.max(1, Math.min(4, level))}
            </p>
            <p className="mt-1 truncate text-[17px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
              {profile.name}
            </p>
            <p className="mt-0.5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              {state === "recovering" ? "Recovering — one session resets it." : formatMinutesLine(focusedMinutes)}
            </p>
          </div>
        </div>
      </button>
      <CompanionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} initial={profile} />
    </>
  );
}

function normalizeProfile(input: unknown): CompanionProfile {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const name = typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.slice(0, 40) : "Star";
  const form =
    raw.form === "comet" || raw.form === "nebula" || raw.form === "orb" ? raw.form : "orb";
  const palette =
    raw.palette === "aqua" || raw.palette === "coral" || raw.palette === "gold" || raw.palette === "violet"
      ? raw.palette
      : "violet";
  const accessory =
    raw.accessory === "ring" ||
    raw.accessory === "star" ||
    raw.accessory === "book" ||
    raw.accessory === "headphones" ||
    raw.accessory === "none"
      ? raw.accessory
      : "none";
  return { name, form, palette, accessory };
}

function formatMinutesLine(minutes: number): string {
  if (minutes < 60) return `${minutes} focus min so far`;
  const hr = Math.floor(minutes / 60);
  const r = minutes % 60;
  return r === 0 ? `${hr} focus hr so far` : `${hr}h ${r}m focus so far`;
}
