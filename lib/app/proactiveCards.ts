import type { DashboardResponse } from "@/lib/api/types";
import type { StreakSummary } from "@/lib/app/streaks";
import { STREAK_MILESTONES } from "@/lib/app/streaks";
import { previousWeekWindow, weekWindowContaining, buildWeeklyReview } from "@/lib/app/weeklyReview";
import { dateKey } from "@/lib/api/time";
import { upcomingExamReadiness } from "./examReadiness";

export type ProactiveTone = "info" | "celebrate" | "warn";

export interface ProactiveAction {
  label: string;
  href?: string;
  /** Message to send to Arcad via /app/arcad?prompt=…, used when there is no href. */
  arcadPrompt?: string;
  /** Opens the "Life happened" recovery sheet on Today, pre-run with this reason. */
  lifeReason?: string;
  /** Optional values to pre-fill the recovery sheet's new-deadline form. */
  lifeDeadline?: { title: string; subject: string | null; dueAt: string };
  /** Optional tone override; primary defaults to accent. */
  variant?: "primary" | "ghost";
}

export interface ProactiveCard {
  /** Stable per-event id used for dismissal storage. */
  id: string;
  kind: "exam-readiness" | "deadline-24h" | "streak-milestone" | "low-week" | "plan-slipped";
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

  // --- Plan slipped (the signature recovery moment) ---
  // Study blocks scheduled earlier today that fully passed while still
  // "planned" mean the day has drifted. Arcad noticing and offering to rebuild
  // is what makes the plan feel self-healing, so this leads.
  const todayKey = dateKey(now.toISOString(), timezone);
  const slipped = data.events.filter(
    (event) =>
      event.category === "study" &&
      event.outcome === "planned" &&
      dateKey(event.startAt, timezone) === todayKey &&
      Date.parse(event.endAt) < nowMs,
  );
  if (slipped.length > 0) {
    cards.push({
      id: `plan-slipped:${todayKey}`,
      kind: "plan-slipped",
      tone: "warn",
      eyebrow: "Life happened",
      title:
        slipped.length === 1
          ? "You slipped past a study block today. Want me to rebuild the rest of your week around it?"
          : `You slipped past ${slipped.length} study blocks today. Want me to rebuild the rest of your week around them?`,
      actions: [{ label: "Rebalance my week", lifeReason: "missed", variant: "primary" }],
    });
  }

  // --- Exam readiness ---
  // Assessments already have real study blocks. Compare the blocks that have
  // elapsed with the minutes actually completed, then offer the same recovery
  // flow a student can use anywhere else in Arcadia.
  const readiness = upcomingExamReadiness(data, now)[0];
  if (readiness) {
    const task = data.tasks.find((candidate) => candidate.id === readiness.taskId);
    if (task) {
      const due = readiness.daysLeft === 0 ? "today" : readiness.daysLeft === 1 ? "tomorrow" : `in ${readiness.daysLeft} days`;
      cards.push({
        id: `exam-readiness:${task.id}:${dateKey(task.dueAt, timezone)}`,
        kind: "exam-readiness",
        tone: "warn",
        eyebrow: "Urgent prep",
        title: `${task.title} is ${due}. You are ${readiness.behindMinutes} min behind on prep.`,
        actions: [{
          label: "Fix my week",
          lifeReason: "new_deadline",
          lifeDeadline: { title: task.title, subject: task.subject ?? null, dueAt: task.dueAt },
          variant: "primary",
        }],
      });
    }
  }

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
      eyebrow: "Deadline · close",
      title:
        hoursOut <= 6
          ? `${soonest.title}, ${hoursOut} hr out, ${soonest.remainingMinutes} min still to do.`
          : `${soonest.title} lands tomorrow with ${soonest.remainingMinutes} min left. Squeeze one in tonight?`,
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
      eyebrow: "Milestone",
      title:
        currentMilestone === 30
          ? "30 days. That's a habit now, not a streak."
          : currentMilestone === 7
            ? "A full week. This one's stuck."
            : "Three in a row, you've got a streak.",
      actions: [
        { label: "See it", href: "/app/streaks", variant: "primary" },
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
    // meaningfully higher (>180 min), so a naturally light studier isn't
    // constantly nagged.
    if (currentReview.totalDone < 60 && previousReview.totalDone > 180) {
      const weekKey = currentWindow.startKey;
      cards.push({
        id: `low-week:${weekKey}`,
        kind: "low-week",
        tone: "info",
        eyebrow: "Check-in",
        title: `Quiet week, ${currentReview.totalDone} of ${currentReview.totalPlanned} planned min. Want to shift anything?`,
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
        eyebrow: "Check-in",
        title: "Zero focus time so far. One short session is enough to reset it.",
        actions: [
          { label: "Start a session", href: "/app/sessions", variant: "primary" },
        ],
      });
    }
  }

  return cards;
}
