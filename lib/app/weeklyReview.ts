import type { PlannerEvent } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";

export interface WeekWindow {
  /** Monday's YYYY-MM-DD in the user's timezone. */
  startKey: string;
  /** Sunday's YYYY-MM-DD in the user's timezone. */
  endKey: string;
  /** Millisecond timestamps for filtering. */
  startMs: number;
  endMs: number;
  /** A human phrase for the header line, e.g. "1 Sep – 7 Sep". */
  label: string;
}

export interface SubjectSlice {
  subject: string;
  plannedMinutes: number;
  doneMinutes: number;
  ratio: number;
}

export interface WeeklyReview {
  window: WeekWindow;
  totalPlanned: number;
  totalDone: number;
  ratio: number;
  sessionsPlanned: number;
  sessionsDone: number;
  subjects: SubjectSlice[];
  /** Highest-ratio subject with real volume, or null if there's nothing to praise. */
  win: WinNote | null;
  /** Lowest-ratio subject with meaningful planned minutes, or null if the week was clean. */
  adjustment: AdjustmentNote | null;
  consistentDays: number;
  plannedDays: number;
  daysStudied: number;
  /** True when we have any planned study to talk about. */
  hasData: boolean;
}

export interface WinNote {
  kind: "subject" | "clean-sweep" | "steady";
  message: string;
  subject?: string;
}

export interface AdjustmentNote {
  kind: "subject-slip" | "volume-low";
  message: string;
  subject?: string;
}

/**
 * ISO-style Monday→Sunday week window that contains the given date.
 * Uses the user's timezone for the day-key boundaries.
 */
export function weekWindowContaining(now: Date, timezone: string): WeekWindow {
  const todayKey = dateKey(now.toISOString(), timezone);
  const [y, m, d] = todayKey.split("-").map(Number);
  // Weekday of "todayKey" in the user's timezone. We anchor at UTC noon on the
  // date so DST transitions don't shift the calendar day.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const jsWeekday = anchor.getUTCDay(); // 0=Sun … 6=Sat
  const daysFromMonday = (jsWeekday + 6) % 7;
  const mondayAnchor = new Date(anchor);
  mondayAnchor.setUTCDate(anchor.getUTCDate() - daysFromMonday);
  const sundayAnchor = new Date(mondayAnchor);
  sundayAnchor.setUTCDate(mondayAnchor.getUTCDate() + 6);

  const startKey = mondayAnchor.toISOString().slice(0, 10);
  const endKey = sundayAnchor.toISOString().slice(0, 10);
  // Bracket the window generously — we filter events by their dateKey afterwards.
  const startMs = Date.parse(`${startKey}T00:00:00Z`) - 24 * 60 * 60 * 1000;
  const endMs = Date.parse(`${endKey}T23:59:59Z`) + 24 * 60 * 60 * 1000;

  const monthShort = new Intl.DateTimeFormat("en-AU", { month: "short" });
  const startLabel = `${mondayAnchor.getUTCDate()} ${monthShort.format(mondayAnchor)}`;
  const endLabel = `${sundayAnchor.getUTCDate()} ${monthShort.format(sundayAnchor)}`;
  const label =
    mondayAnchor.getUTCMonth() === sundayAnchor.getUTCMonth()
      ? `${mondayAnchor.getUTCDate()} – ${sundayAnchor.getUTCDate()} ${monthShort.format(sundayAnchor)}`
      : `${startLabel} – ${endLabel}`;

  return { startKey, endKey, startMs, endMs, label };
}

/** The window covering the most recently completed calendar week. */
export function previousWeekWindow(now: Date, timezone: string): WeekWindow {
  const previous = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return weekWindowContaining(previous, timezone);
}

/**
 * Roll planner events for the given week into a review summary.
 * Only study-category events count — school/sport/sleep are ignored here.
 */
export function buildWeeklyReview(
  events: PlannerEvent[],
  window: WeekWindow,
  timezone: string,
): WeeklyReview {
  const studyEvents = events.filter((event) => event.category === "study");
  const inWindow = studyEvents.filter((event) => {
    const key = dateKey(event.startAt, timezone);
    return key >= window.startKey && key <= window.endKey;
  });

  const subjectMap = new Map<string, { planned: number; done: number }>();
  let totalPlanned = 0;
  let totalDone = 0;
  let sessionsDone = 0;
  const plannedDays = new Set<string>();
  const consistentDays = new Set<string>();
  const doneDays = new Set<string>();

  // Day-level totals for consistency count
  const dayPlanned = new Map<string, number>();
  const dayDone = new Map<string, number>();

  for (const event of inWindow) {
    const minutes = Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
    const subject = (event.subject || "General").trim() || "General";
    const key = dateKey(event.startAt, timezone);
    const bucket = subjectMap.get(subject) ?? { planned: 0, done: 0 };
    bucket.planned += minutes;
    totalPlanned += minutes;
    plannedDays.add(key);
    dayPlanned.set(key, (dayPlanned.get(key) ?? 0) + minutes);
    if (event.outcome === "completed") {
      bucket.done += minutes;
      totalDone += minutes;
      sessionsDone += 1;
      doneDays.add(key);
      dayDone.set(key, (dayDone.get(key) ?? 0) + minutes);
    }
    subjectMap.set(subject, bucket);
  }

  for (const [key, planned] of dayPlanned.entries()) {
    const done = dayDone.get(key) ?? 0;
    if (planned > 0 && done / planned >= 0.7) consistentDays.add(key);
  }

  const subjects: SubjectSlice[] = [...subjectMap.entries()]
    .map(([subject, bucket]) => ({
      subject,
      plannedMinutes: Math.round(bucket.planned),
      doneMinutes: Math.round(bucket.done),
      ratio: bucket.planned > 0 ? bucket.done / bucket.planned : 0,
    }))
    .sort((a, b) => b.plannedMinutes - a.plannedMinutes);

  const ratio = totalPlanned > 0 ? totalDone / totalPlanned : 0;

  return {
    window,
    totalPlanned: Math.round(totalPlanned),
    totalDone: Math.round(totalDone),
    ratio,
    sessionsPlanned: inWindow.length,
    sessionsDone,
    subjects,
    win: pickWin(subjects, ratio),
    adjustment: pickAdjustment(subjects, ratio),
    consistentDays: consistentDays.size,
    plannedDays: plannedDays.size,
    daysStudied: doneDays.size,
    hasData: inWindow.length > 0,
  };
}

function pickWin(subjects: SubjectSlice[], overallRatio: number): WinNote | null {
  if (subjects.length === 0) return null;
  const meaningful = subjects.filter((subject) => subject.plannedMinutes >= 60);
  const cleanSweep = meaningful.length > 0 && meaningful.every((s) => s.ratio >= 0.9);
  if (cleanSweep) {
    return {
      kind: "clean-sweep",
      message: "Hit almost every planned session this week.",
    };
  }
  // Best ratio among subjects with real volume
  const contender = [...meaningful].sort((a, b) => b.ratio - a.ratio)[0];
  if (contender && contender.ratio >= 0.75) {
    return {
      kind: "subject",
      subject: contender.subject,
      message: `${contender.subject} held together — ${Math.round(contender.ratio * 100)}% of planned time.`,
    };
  }
  if (overallRatio >= 0.5) {
    return {
      kind: "steady",
      message: "You still moved the needle — over half the plan landed.",
    };
  }
  return null;
}

function pickAdjustment(subjects: SubjectSlice[], overallRatio: number): AdjustmentNote | null {
  if (subjects.length === 0) return null;
  const laggards = subjects
    .filter((subject) => subject.plannedMinutes >= 30 && subject.ratio < 0.7)
    .sort((a, b) => a.ratio - b.ratio);
  const worst = laggards[0];
  if (worst) {
    const missedMin = worst.plannedMinutes - worst.doneMinutes;
    return {
      kind: "subject-slip",
      subject: worst.subject,
      message: `${worst.subject} slipped by ${Math.round(missedMin)} min — worth pinning first this week.`,
    };
  }
  if (overallRatio < 0.5) {
    return {
      kind: "volume-low",
      message: "Volume was low overall — even a couple of focused blocks reset the pattern.",
    };
  }
  return null;
}
