import type { SchoolTerm } from "@/lib/api/types";
import { addDays, dayColumn, mondayOf, type DayColumn } from "./calendar";

export interface PeriodWeek {
  /** "Week 3", "T3 W10", or "Holidays" for a week with no school days. */
  label: string;
  /** Week number within the term; null in the holidays. */
  number: number | null;
  /** Whether this is a school week. Rolling windows can cross several terms. */
  school: boolean;
  days: DayColumn[];
}

/**
 * One stretch of the planner's term view: a school term plus the holidays
 * after it, Monday to Sunday, so every date belongs to exactly one period.
 * Without the student's term dates it's a quarter of the year instead.
 */
export interface TermPeriod {
  id: string;
  /** "Term 3" or "Jul – Sep". */
  name: string;
  year: number;
  /** First Monday and last Sunday shown. */
  start: string;
  end: string;
  /** First and last school day; null for a quarter. */
  termStart: string | null;
  termEnd: string | null;
  weeks: PeriodWeek[];
  /** Real term dates, rather than a fallback quarter. */
  isTerm: boolean;
}

const MONTH = new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" });

function termPeriods(terms: SchoolTerm[]): Array<Omit<TermPeriod, "weeks">> {
  const sorted = [...terms].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.map((term, index) => {
    const next = sorted[index + 1];
    const start = mondayOf(term.start);
    // Holidays run to the Sunday before the next term's first week; after the
    // last known term, three weeks of holidays.
    const end = next ? addDays(mondayOf(next.start), -1) : addDays(mondayOf(term.end), 27);
    return {
      id: `${term.year}-t${term.term}`,
      name: `Term ${term.term}`,
      year: term.year,
      start,
      end,
      termStart: term.start,
      termEnd: term.end,
      isTerm: true,
    };
  });
}

function firstOfQuarter(year: number, quarter: number): string {
  return new Date(Date.UTC(year, quarter * 3, 1, 12)).toISOString().slice(0, 10);
}

/** Quarters run from the Monday of the week holding the 1st to the Sunday before the next. */
function quarterPeriod(key: string): Omit<TermPeriod, "weeks"> {
  const year = Number(key.slice(0, 4));
  const quarter = Math.floor((Number(key.slice(5, 7)) - 1) / 3);
  for (const offset of [0, 1, -1]) {
    const q = quarter + offset;
    const y = year + Math.floor(q / 4);
    const qq = ((q % 4) + 4) % 4;
    const first = firstOfQuarter(y, qq);
    const nextFirst = qq === 3 ? firstOfQuarter(y + 1, 0) : firstOfQuarter(y, qq + 1);
    const start = mondayOf(first);
    const end = addDays(mondayOf(nextFirst), -1);
    if (key < start || key > end) continue;
    const month = (date: string) => MONTH.format(new Date(`${date}T12:00:00Z`));
    return {
      id: `${y}-q${qq + 1}`,
      name: `${month(first)} – ${month(addDays(nextFirst, -1))}`,
      year: y,
      start,
      end,
      termStart: null,
      termEnd: null,
      isTerm: false,
    };
  }
  throw new Error(`No quarter holds ${key}`);
}

function withWeeks(period: Omit<TermPeriod, "weeks">, today: string, timezone: string): TermPeriod {
  const weeks: PeriodWeek[] = [];
  let number = 0;
  for (let monday = period.start; monday <= period.end; monday = addDays(monday, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => dayColumn(addDays(monday, i), today, timezone));
    const inTerm = !period.termStart || days.some((day) => isSchoolDay(period, day.key));
    if (inTerm) number += 1;
    weeks.push({ label: inTerm ? `Week ${number}` : "Holidays", number: inTerm ? number : null, school: inTerm, days });
  }
  return { ...period, weeks };
}

/**
 * A useful term view is anchored around the student, not the beginning of a
 * term. It intentionally crosses term and holiday boundaries so today stays
 * in the middle and the next stretch of work is always visible.
 */
export function rollingPeriodFor(key: string, terms: SchoolTerm[], today: string, timezone: string): TermPeriod {
  const centre = mondayOf(key);
  const start = addDays(centre, -35); // Five weeks before the current week.
  const end = addDays(centre, 48); // Six weeks after it, inclusive.
  const sorted = [...terms].sort((a, b) => a.start.localeCompare(b.start));
  const weeks: PeriodWeek[] = [];

  for (let monday = start; monday <= end; monday = addDays(monday, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => dayColumn(addDays(monday, i), today, timezone));
    const term = sorted.find((candidate) => days.some((day) => day.key >= candidate.start && day.key <= candidate.end));
    if (!term) {
      weeks.push({ label: "Holidays", number: null, school: false, days });
      continue;
    }
    const firstSchoolDay = days.find((day) => day.key >= term.start && day.key <= term.end)?.key ?? term.start;
    const number = Math.floor(
      (Date.parse(`${mondayOf(firstSchoolDay)}T12:00:00Z`) - Date.parse(`${mondayOf(term.start)}T12:00:00Z`)) / (7 * 86_400_000),
    ) + 1;
    weeks.push({ label: `T${term.term} W${number}`, number, school: true, days });
  }

  const year = Number(centre.slice(0, 4));
  return {
    id: `rolling:${centre}`,
    name: "Rolling term view",
    year,
    start,
    end,
    termStart: null,
    termEnd: null,
    weeks,
    isTerm: false,
  };
}

/** The period a date falls in. */
export function periodFor(key: string, terms: SchoolTerm[], today: string, timezone: string): TermPeriod {
  const found = termPeriods(terms).find((period) => key >= period.start && key <= period.end);
  return withWeeks(found ?? quarterPeriod(key), today, timezone);
}

/** A date in the period before or after. */
export function stepPeriod(period: TermPeriod, direction: -1 | 1): string {
  return direction < 0 ? addDays(period.start, -1) : addDays(period.end, 1);
}

/** Between the term's first and last school day, weekends included. */
export function isSchoolDay(period: Pick<TermPeriod, "termStart" | "termEnd">, key: string): boolean {
  if (!period.termStart || !period.termEnd) return true;
  return key >= period.termStart && key <= period.termEnd;
}

/** "Term 3 · Week 10", "Term 3 · Holidays", or the quarter's week. */
export function periodPosition(period: TermPeriod, key: string): string {
  const week = period.weeks.find((w) => key >= w.days[0].key && key <= w.days[6].key);
  if (!week) return period.name;
  if (week.number === null) return `${period.name} · Holidays`;
  return `${period.name} · Week ${week.number}`;
}

/**
 * " · Holidays, back 6 Oct" while today sits in the holidays at the end of
 * this period (term periods run on through the break that follows them).
 */
export function holidayNote(period: TermPeriod, today: string): string {
  if (!period.isTerm || !period.termEnd || today <= period.termEnd || today > period.end) return "";
  const back = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${addDays(period.end, 1)}T12:00:00Z`),
  );
  return ` · Holidays, back ${back}`;
}

/** "21 Jul – 25 Sep" for the school days, or the whole span for a quarter. */
export function periodDates(period: TermPeriod): string {
  const format = (key: string) =>
    new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
  return `${format(period.termStart ?? period.start)} – ${format(period.termEnd ?? period.end)}`;
}
