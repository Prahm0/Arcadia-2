"use client";

import { useMemo } from "react";
import { formatDueSoon } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { upcomingExamReadiness } from "@/lib/app/examReadiness";

/** The most deadlines the rail lists. */
const RAIL_DEADLINES = 3;

/**
 * The column beside Today: just what's due next, as quiet text with no card
 * around it, beside Today on wide screens only (on a phone it was a repeat at
 * the bottom). The streak and today's ring live in the main column, so they
 * aren't repeated here. TodayView hides the column when nothing is due.
 */
export default function TodayRail() {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";
  const deadlines = useMemo(() => {
    const urgency = new Map(upcomingExamReadiness(data).map((item) => [item.taskId, item]));
    return [...data.focusTasks]
      .sort((a, b) => {
        const urgentA = urgency.get(a.id);
        const urgentB = urgency.get(b.id);
        if (Boolean(urgentA) !== Boolean(urgentB)) return urgentA ? -1 : 1;
        if (urgentA && urgentB && urgentA.behindMinutes !== urgentB.behindMinutes) return urgentB.behindMinutes - urgentA.behindMinutes;
        return Date.parse(a.dueAt) - Date.parse(b.dueAt);
      })
      .slice(0, RAIL_DEADLINES);
  }, [data]);

  if (deadlines.length === 0) return null;

  return (
    <aside aria-label="Due next" className="hidden self-start @3xl/main:sticky @3xl/main:top-6 @3xl/main:block @3xl/main:pt-2">
      <ul className="flex flex-col gap-4">
        {deadlines.map((task) => (
          <li key={task.id} className="min-w-0">
            <p className="truncate text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
              {task.title}
            </p>
            <p className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              {task.subject ? `${task.subject} · ` : ""}
              {formatDueSoon(task.dueAt, timezone)}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
