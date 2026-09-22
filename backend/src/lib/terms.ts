/**
 * Government school term dates (first and last student day), so a syllabus
 * that says "Term 3, Week 4" can be pinned to real dates.
 *
 * Taken from each education department's own site on 2026-09-22:
 * QLD education.qld.gov.au, NSW education.nsw.gov.au (Eastern division),
 * VIC vic.gov.au, SA education.sa.gov.au, WA education.wa.edu.au,
 * TAS decyp.tas.gov.au. ACT and NT aren't here yet (their calendars are
 * PDF-only / blocked); for those states only dates written in the document
 * itself are used. Add each new year as departments publish it.
 */
type Term = [start: string, end: string];

export const TERM_DATES: Record<string, Record<number, Term[]>> = {
  QLD: {
    2026: [["2026-01-27", "2026-04-02"], ["2026-04-20", "2026-06-26"], ["2026-07-13", "2026-09-18"], ["2026-10-06", "2026-12-11"]],
    2027: [["2027-01-27", "2027-03-25"], ["2027-04-12", "2027-06-25"], ["2027-07-12", "2027-09-17"], ["2027-10-05", "2027-12-10"]],
  },
  NSW: {
    2026: [["2026-02-02", "2026-04-02"], ["2026-04-22", "2026-07-03"], ["2026-07-21", "2026-09-25"], ["2026-10-13", "2026-12-17"]],
    2027: [["2027-02-03", "2027-04-09"], ["2027-04-29", "2027-07-02"], ["2027-07-20", "2027-09-24"], ["2027-10-12", "2027-12-20"]],
  },
  VIC: {
    2026: [["2026-01-28", "2026-04-02"], ["2026-04-20", "2026-06-26"], ["2026-07-13", "2026-09-18"], ["2026-10-05", "2026-12-18"]],
    2027: [["2027-01-28", "2027-03-25"], ["2027-04-12", "2027-06-25"], ["2027-07-12", "2027-09-17"], ["2027-10-04", "2027-12-17"]],
  },
  SA: {
    2026: [["2026-01-27", "2026-04-10"], ["2026-04-27", "2026-07-03"], ["2026-07-20", "2026-09-25"], ["2026-10-12", "2026-12-11"]],
    2027: [["2027-01-27", "2027-04-09"], ["2027-04-26", "2027-07-02"], ["2027-07-19", "2027-09-24"], ["2027-10-11", "2027-12-10"]],
  },
  WA: {
    2026: [["2026-02-02", "2026-04-02"], ["2026-04-20", "2026-07-03"], ["2026-07-20", "2026-09-25"], ["2026-10-12", "2026-12-17"]],
    2027: [["2027-02-01", "2027-04-09"], ["2027-04-26", "2027-07-02"], ["2027-07-19", "2027-09-24"], ["2027-10-11", "2027-12-16"]],
  },
  TAS: {
    2026: [["2026-02-05", "2026-04-17"], ["2026-05-04", "2026-07-10"], ["2026-07-27", "2026-10-02"], ["2026-10-19", "2026-12-18"]],
    2027: [["2027-02-04", "2027-04-09"], ["2027-04-26", "2027-07-02"], ["2027-07-19", "2027-09-24"], ["2027-10-11", "2027-12-16"]],
  },
};

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function toDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Monday of the calendar week containing `ms` (UTC calendar maths on plain dates). */
function mondayOf(ms: number): number {
  const weekday = new Date(ms).getUTCDay(); // 0 = Sunday
  return ms - ((weekday + 6) % 7) * DAY_MS;
}

export function hasTermDates(state: string | null | undefined, year: number): boolean {
  return Boolean(state && TERM_DATES[state]?.[year]);
}

/**
 * The span of "Term N, Week W" as plain dates: week 1 is the calendar week
 * the term starts in, and the span is clipped to the term. Null when the
 * state/year isn't known or the week is outside the term.
 */
export function termWeek(
  state: string | null | undefined,
  year: number,
  term: number,
  week: number,
): { start: string; end: string } | null {
  const range = state ? TERM_DATES[state]?.[year]?.[term - 1] : undefined;
  if (!range || week < 1) return null;
  const termStart = toUtc(range[0]);
  const termEnd = toUtc(range[1]);
  const monday = mondayOf(termStart) + (week - 1) * 7 * DAY_MS;
  if (monday > termEnd) return null;
  return {
    start: toDate(Math.max(monday, termStart)),
    end: toDate(Math.min(monday + 4 * DAY_MS, termEnd)),
  };
}

/** Which term and week a date falls in, for labelling ("T4 W2"). */
export function termWeekOf(
  state: string | null | undefined,
  date: string,
): { term: number; week: number } | null {
  const year = Number(date.slice(0, 4));
  const terms = state ? TERM_DATES[state]?.[year] : undefined;
  if (!terms) return null;
  const ms = toUtc(date);
  for (let index = 0; index < terms.length; index++) {
    const start = toUtc(terms[index][0]);
    const end = toUtc(terms[index][1]);
    if (ms >= start && ms <= end + 2 * DAY_MS) {
      return { term: index + 1, week: Math.floor((mondayOf(ms) - mondayOf(start)) / (7 * DAY_MS)) + 1 };
    }
  }
  return null;
}
