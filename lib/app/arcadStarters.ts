import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import type { StreakSummary } from "@/lib/app/streaks";

export interface Starter {
  /** Displayed label on the chip. */
  label: string;
  /** The actual message sent to Arcad on click. */
  message: string;
  /** Optional tone for chip styling — accent for the primary suggestion. */
  tone?: "default" | "accent";
}

/**
 * Contextual starters built from the student's live plan. These reference
 * real subjects, real tasks, real gaps — so tapping a starter doesn't feel
 * like a GPT-demo prompt, it feels like Arcad already knows what to do.
 */
export function buildContextualStarters(
  data: DashboardResponse,
  streak: StreakSummary,
): Starter[] {
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const now = new Date();
  const todayKey = dateKey(now.toISOString(), timezone);
  const nowMs = now.getTime();

  const out: Starter[] = [];

  // 1. Missed sessions in the last 24 hours — top priority.
  const missedRecently = data.events.filter((event) => {
    if (event.category !== "study") return false;
    if (event.outcome !== "planned") return false;
    const endMs = Date.parse(event.endAt);
    return endMs + 2 * 60 * 1000 <= nowMs && nowMs - endMs <= 24 * 60 * 60 * 1000;
  });
  if (missedRecently.length > 0) {
    const subject = missedRecently[0].subject || "study block";
    out.push({
      label: `Recover ${subject}`,
      message: `I missed ${subject} — what's the best way to catch up before the deadline?`,
      tone: "accent",
    });
  }

  // 2. A concrete "next study block" nudge — reference today's next planned session.
  const nextStudy = data.events
    .filter((event) => event.category === "study" && event.outcome === "planned")
    .filter((event) => Date.parse(event.startAt) >= nowMs)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
  if (nextStudy) {
    const subject = nextStudy.subject || "the next session";
    out.push({
      label: `Move ${subject} later`,
      message: `Can you move my ${subject} session ${
        dateKey(nextStudy.startAt, timezone) === todayKey ? "later today" : "later"
      }?`,
    });
  }

  // 3. Nearest deadline — talk about it.
  const nearest = data.focusTasks[0] ?? null;
  if (nearest) {
    out.push({
      label: `Plan for ${truncate(nearest.title, 24)}`,
      message: `Help me plan the work for "${nearest.title}" before it's due.`,
    });
  }

  // 4. Streak framing.
  if (streak.current >= 1) {
    out.push({
      label: "How am I tracking?",
      message: "How am I tracking against the plan this week?",
    });
  } else if (streak.longest > 0) {
    out.push({
      label: "Reset the streak",
      message: "My streak broke — what's the smallest thing I can do today to restart it?",
    });
  }

  // 5. Sunday review — surface it explicitly on Sunday.
  const isSunday =
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone, weekday: "short" }).format(now) === "Sun";
  if (isSunday) {
    out.push({
      label: "Review last week",
      message: "Give me a review of last week — what went well, what didn't.",
    });
  }

  // 6. A universal fallback for brand-new users with no plan at all.
  if (data.events.length === 0 && data.tasks.length === 0) {
    out.push({
      label: "Set up my subjects",
      message: "Help me set up my subjects and get my first tasks scheduled.",
    });
  }

  // 7. Always-available add-something starter.
  out.push({
    label: "Add a task",
    message: "Add a task — I'll tell you what it is, when it's due, and how long.",
  });

  // De-dup by label and cap.
  const seen = new Set<string>();
  const unique: Starter[] = [];
  for (const starter of out) {
    if (seen.has(starter.label)) continue;
    seen.add(starter.label);
    unique.push(starter);
    if (unique.length >= 5) break;
  }
  return unique;
}

/**
 * A warm one-line greeting for the top of the Arcad panel. Reads the plan the
 * same way Arcad does — no generic "Ask anything" prompt.
 */
export function buildGreeting(
  data: DashboardResponse,
  streak: StreakSummary,
): { primary: string; secondary: string } {
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "2-digit", hour12: false }).format(new Date()),
  );
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  const first = (data.user.name || "there").split(" ")[0];

  const now = Date.now();
  const todayKey = dateKey(new Date().toISOString(), timezone);
  const todaysStudy = data.events.filter(
    (event) => event.category === "study" && dateKey(event.startAt, timezone) === todayKey,
  );
  const remaining = todaysStudy.filter((event) => event.outcome === "planned").length;
  const missedRecently = countMissedRecently(data.events, now);

  let secondary: string;
  if (missedRecently > 0) {
    secondary =
      missedRecently === 1
        ? "One session slipped — want to fix it?"
        : `${missedRecently} sessions slipped — let's clean them up.`;
  } else if (remaining > 0) {
    secondary =
      remaining === 1
        ? "One thing still on your plan today."
        : `${remaining} things still on your plan today.`;
  } else if (todaysStudy.length > 0) {
    secondary = "Today's done. Want to look at the rest of the week?";
  } else if (data.tasks.length === 0) {
    secondary = "Nothing on the plan yet — tell me what's coming up.";
  } else if (streak.current >= 3) {
    secondary = `${streak.current} consistent days deep. What's next?`;
  } else if (streak.current > 0) {
    secondary = "Streak's alive — what's on your mind?";
  } else {
    secondary = "Ready when you are.";
  }

  return {
    primary: `${greeting}, ${first}.`,
    secondary,
  };
}

function countMissedRecently(events: PlannerEvent[], nowMs: number): number {
  return events.filter((event) => {
    if (event.category !== "study") return false;
    if (event.outcome !== "planned") return false;
    const endMs = Date.parse(event.endAt);
    return endMs + 2 * 60 * 1000 <= nowMs && nowMs - endMs <= 24 * 60 * 60 * 1000;
  }).length;
}

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}
