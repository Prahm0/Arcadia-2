import type { PlannerEvent } from "@/lib/api/types";

type Block = Pick<PlannerEvent, "category" | "startAt" | "endAt" | "outcome">;

/** Monday of the week holding `day` (YYYY-MM-DD), as YYYY-MM-DD. */
export function mondayOf(day: string): string {
  const anchor = new Date(`${day}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
  return anchor.toISOString().slice(0, 10);
}

/** Local YYYY-MM-DD of an instant in `timezone`. */
function localDay(at: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

/**
 * This week's study blocks, Monday to Sunday in the student's zone: how many
 * were planned, how many are done and the minutes they add up to.
 */
export function weekProgress(events: Block[], timezone: string, today: string) {
  const start = mondayOf(today);
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const last = end.toISOString().slice(0, 10);
  let planned = 0;
  let done = 0;
  let minutes = 0;
  for (const event of events) {
    if (event.category !== "study") continue;
    const day = localDay(event.startAt, timezone);
    if (day < start || day > last) continue;
    planned += 1;
    if (event.outcome === "completed") {
      done += 1;
      minutes += Math.max(0, Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000));
    }
  }
  return { planned, done, minutes, ratio: planned ? done / planned : 0 };
}

/** The weekly review leads the page on Sundays and Mondays, when there is a week to look back on. */
export function reviewLeads(today: string): boolean {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 1;
}
