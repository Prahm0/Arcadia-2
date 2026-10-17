"use client";

import { useState } from "react";
import { updateProfile } from "@/lib/api/profile";
import { dateKey } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { hasCompletedStudyBlock } from "@/lib/app/firstStudyBlock";
import { holidayStartLabel, upcomingHoliday, type HolidayMode } from "@/lib/app/holidays";
import AppButton from "./AppButton";

const CHOICES: Array<{ mode: HolidayMode; label: string }> = [
  { mode: "normal", label: "Keep my plan" },
  { mode: "light", label: "Go lighter" },
  { mode: "off", label: "Take a break" },
];

/**
 * Just before (and on the first day of) the school holidays, asks once
 * whether to keep the usual plan, halve it or pause subject study.
 * Deadlines keep their time either way. Settings can change it any time.
 */
export default function HolidayCard() {
  const { data, reload } = useDashboardData();
  const [busy, setBusy] = useState<HolidayMode | null>(null);
  const [answered, setAnswered] = useState(false);
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const today = dateKey(new Date().toISOString(), timezone);
  const holiday = upcomingHoliday(data.terms, today);

  if (answered || !holiday || !hasCompletedStudyBlock(data.events)) return null;
  if (data.profile?.holidayAskedFor === holiday.start) return null;

  async function choose(mode: HolidayMode) {
    setBusy(mode);
    try {
      await updateProfile({ holidayMode: mode, holidayAskedFor: holiday!.start });
      setAnswered(true);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  const when = holidayStartLabel(holiday.start, today);
  return (
    <section
      aria-label="School holidays"
      className="rounded-lg p-5"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <p className="text-[16px] font-semibold" style={{ color: "var(--app-text)" }}>
        {when === "today" ? "School holidays start today" : `School holidays start ${when}`}
      </p>
      <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
        Keep your usual plan, go lighter, or take a break? Deadlines still get their time.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {CHOICES.map((choice) => (
          <AppButton
            key={choice.mode}
            variant={choice.mode === "light" ? "primary" : "secondary"}
            loading={busy === choice.mode}
            disabled={busy !== null}
            onClick={() => void choose(choice.mode)}
          >
            {choice.label}
          </AppButton>
        ))}
      </div>
    </section>
  );
}
