import type { SchoolTerm } from "@/lib/api/types";

export type HolidayMode = "normal" | "light" | "off";

function shift(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * The school holidays starting within `ahead` days of `today` (or today), as
 * the days between one term's last day and the next term's first. Null when
 * there's no break coming up or the state's term dates aren't known.
 */
export function upcomingHoliday(terms: SchoolTerm[] | undefined, today: string, ahead = 3): { start: string; end: string } | null {
  const sorted = [...(terms ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = shift(sorted[i].end, 1);
    const end = shift(sorted[i + 1].start, -1);
    if (start > end) continue;
    if (today >= shift(start, -ahead) && today <= start) return { start, end };
  }
  return null;
}

/** The term that started within the last `within` days, if any. */
export function termJustStarted(terms: SchoolTerm[] | undefined, today: string, within = 3): SchoolTerm | null {
  return (terms ?? []).find((term) => today >= term.start && today < shift(term.start, within)) ?? null;
}

/** "Saturday", or "today" when the break starts today. */
export function holidayStartLabel(start: string, today: string): string {
  if (start === today) return "today";
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" }).format(new Date(`${start}T12:00:00Z`));
}
