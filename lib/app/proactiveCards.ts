import type { DashboardResponse } from "@/lib/api/types";
import type { StreakSummary } from "@/lib/app/streaks";
import { STREAK_MILESTONES } from "@/lib/app/streaks";
import { previousWeekWindow, weekWindowContaining, buildWeeklyReview } from "@/lib/app/weeklyReview";
import { dateKey } from "@/lib/api/time";

export type ProactiveTone = "info" | "celebrate" | "warn";

export interface ProactiveAction {
  label: string;
  href?: string;
  /** Message to send to Arcad via /app/arcad?prompt=… — used when there is no href. */
  arcadPrompt?: string;
  /** Optional tone override; primary defaults to accent. */
  variant?: "primary" | "ghost";
}

export interface ProactiveCard {
  /** Stable per-event id used for dismissal storage. */
  id: string;
  kind: "deadline-24h" | "streak-milestone" | "low-week";
  tone: ProactiveTone;
  eyebrow: string;
  title: string;
  actions?: ProactiveAction[];
}

/**
 * Zero or more proactive check-in cards derived from live plan state.
 *
 * The four proactive triggers from the plan:
 *   - Missed session       → handled elsewhere by MissedRecoveryCards
 *   - Deadline within 24h  → here (deadline-24h)
 *   - Streak milestone hit → here (streak-milestone), one card per milestone
 *   - Unusually low week   → here (low-week), only in the last 3 days of the week
 *
 * Every card carries a stable `id` so the visual layer can remember dismissals
 * per event in localStorage.
 */
export function buildProactiveCards(
  data: DashboardResponse,
  streak: StreakSummary,
  now: Date = new Date(),
): ProactiveCard[] {
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const nowMs = now.getTime();
  const cards: ProactiveCard[] = [];

  // --- Deadline within 24h ---
  // Any pending task due in the next 24 hours with meaningful work remaining.
  // Only surface if the deadline day has not fully passed today (the sort keeps
  // the closest one first).
  const soonest = data.tasks
    .filter((task) => task.status === "pending")
    .filter((task) => task.remainingMinutes >= 30)
    .filter((task) => {
      const due = Date.parse(task.dueAt);
      return due >= nowMs && due - nowMs <= 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  if (soonest) {
    const hoursOut = Math.max(1, Math.round((Date.parse(soonest.dueAt) - nowMs) / 3_600_000));
    cards.push({
      id: `deadline-24h:${soonest.id}`,
      kind: "deadline-24h",
      tone: "warn",
      eyebrow: "Deadline · soon",
      title:
        hoursOut <= 6
          ? `${soonest.title} is due in ${hoursOut} hr — ${soonest.remainingMinutes} min still to go.`
          : `${soonest.title} is due tomorrow with ${soonest.remainingMinutes} min left. Want to squeeze in a session tonight?`,
      actions: [
        {
          label: "Plan the last session",
          arcadPrompt: `${soonest.title} is due in ${hoursOut} hours and I have ${soonest.remainingMinutes} minutes left. What's the best way to finish it?`,
          variant: "primary",
        },
        { label: "Open task", href: "/app/deadlines", variant: "ghost" },
      ],
    });
  }

  // --- Streak milestone ---
  // The card carries the milestone value in its id, so a user who hits 3 today
  // and 7 next week sees each celebration exactly once. STREAK_MILESTONES is
  // ordered; the highest currently-hit milestone gets a card.
  const currentMilestone = [...STREAK_MILESTONES].reverse().find((m) => streak.current >= m);
  if (currentMilestone) {
    cards.push({
      id: `streak-milestone:${currentMilestone}`,
      kind: "streak-milestone",
      tone: "celebrate",
      eyebrow: "Streak milestone",
      title:
        currentMilestone === 30
          ? "30 consistent days. That's a habit, not a streak."
          : `${currentMilestone} consistent days in a row — this is starting to stick.`,
      actions: [
        { label: "See streak", href: "/app/analytics", variant: "primary" },
      ],
    });
  }

  // --- Unusually low week ---
  // Surface only in the last stretch of the week (Thu → Sun local) so it lands
  // when there's still time to move something. Compare current-week done to
  // previous-week done, with a hard floor for tiny users.
  const weekday = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, weekday: "short" }).format(now);
  if (["Thu", "Fri", "Sat", "Sun"].includes(weekday)) {
    const currentWindow = weekWindowContaining(now, timezone);
    const previousWindow = previousWeekWindow(now, timezone);
    const currentReview = buildWeeklyReview(data.events, currentWindow, timezone);
    const previousReview = buildWeeklyReview(data.events, previousWindow, timezone);
    // Trigger when this week has less than 60 min done AND last week was
    // meaningfully higher (>180 min) — so a naturally light studier isn't
    // constantly nagged.
    if (currentReview.totalDone < 60 && previousReview.totalDone > 180) {
      const weekKey = currentWindow.startKey;
      cards.push({
        id: `low-week:${weekKey}`,
        kind: "low-week",
        tone: "info",
        eyebrow: "Weekly check-in",
        title: `This week has been quiet — ${currentReview.totalDone} of ${currentReview.totalPlanned} planned min. Anything I can help shift?`,
        actions: [
          {
            label: "Talk it over",
            arcadPrompt: "This week's been quiet compared to last. Can you help me plan the rest of it?",
            variant: "primary",
          },
          { label: "See review", href: "/app/review", variant: "ghost" },
        ],
      });
    } else if (currentReview.totalDone === 0 && dateKey(now.toISOString(), timezone) === currentWindow.endKey && data.events.some((e) => e.category === "study")) {
      // Sunday-with-no-study rescue when the student otherwise has a plan.
      cards.push({
        id: `low-week:${currentWindow.startKey}:sundayzero`,
        kind: "low-week",
        tone: "info",
        eyebrow: "Weekly check-in",
        title: "Zero focus time this week yet — one short session is enough to reset the pattern.",
        actions: [
          { label: "Start focus", href: "/app/focus", variant: "primary" },
        ],
      });
    }
  }

  return cards;
}
