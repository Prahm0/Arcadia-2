"use client";

import { useState } from "react";
import { dateKey } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { hasCompletedStudyBlock } from "@/lib/app/firstStudyBlock";
import { termJustStarted } from "@/lib/app/holidays";
import AppButton from "./AppButton";

const STORAGE_PREFIX = "arcadia:new-term:";
const FOUR_WEEKS = 28 * 86_400_000;

/**
 * The first days of a term, when nothing is due in the next four weeks:
 * a nudge to add what's coming, straight into quick add. Once per term.
 */
export default function NewTermCard({ onAdd }: { onAdd: () => void }) {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const today = dateKey(new Date().toISOString(), timezone);
  const term = termJustStarted(data.terms, today);
  const key = term ? `${STORAGE_PREFIX}${term.start}` : null;
  // Today only renders on the client, after the dashboard has loaded.
  const [dismissed, setDismissed] = useState(() => {
    if (!key || typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const [now] = useState(() => Date.now());
  const somethingDue = data.tasks.some((task) => {
    const due = Date.parse(task.dueAt);
    return task.status !== "complete" && due >= now && due <= now + FOUR_WEEKS;
  });
  if (!term || !key || dismissed || somethingDue || !hasCompletedStudyBlock(data.events)) return null;

  function close() {
    try {
      window.localStorage.setItem(key!, "1");
    } catch {
      // Shown again next visit; harmless.
    }
    setDismissed(true);
  }

  return (
    <section
      aria-label="New term"
      className="rounded-lg p-5"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <p className="text-[16px] font-semibold" style={{ color: "var(--app-text)" }}>
        Term {term.term} has started. What&apos;s due?
      </p>
      <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
        Add your first deadlines and Arcadia plans the weeks before each one.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <AppButton
          variant="primary"
          onClick={() => {
            close();
            onAdd();
          }}
        >
          Add deadlines
        </AppButton>
        <AppButton variant="ghost" onClick={close}>
          Not now
        </AppButton>
      </div>
    </section>
  );
}
