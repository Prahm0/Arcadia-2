/**
 * Seeded generator of synthetic study weeks (PROTOCOL.md section 5).
 * Same seed, same instance, on any machine.
 */
import { commitmentIntervals, horizonDates, sleepIntervals, subtract, type Interval } from "./calendar.ts";
import { addDays, localToUtc, offsetAt } from "./localtime.ts";
import type { CommitmentSpec, Instance, SubjectSpec, TaskSpec } from "./types.ts";
import { MINUTE } from "./types.ts";

export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  return { next, int, pick };
}
export type Rng = ReturnType<typeof rng>;

const ZONES = [
  "Australia/Sydney", "Australia/Sydney", "Australia/Melbourne", "Australia/Melbourne",
  "Australia/Brisbane", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide",
  "Australia/Hobart", "Australia/Darwin", "Australia/Lord_Howe",
  "Pacific/Auckland", "Europe/London", "America/Los_Angeles",
] as const;

/** Mondays. The last three put a clock change inside the 28 days for most zones. */
const NORMAL_STARTS = ["2026-10-12", "2026-11-02", "2026-11-16", "2027-02-08", "2027-05-10"];
const CHANGE_STARTS = ["2026-09-21", "2027-03-15", "2026-10-19"];

const SUBJECT_NAMES = [
  "English Advanced", "Mathematics Advanced", "Mathematics Extension 1", "Chemistry", "Physics",
  "Biology", "Economics", "Modern History", "Legal Studies", "Business Studies",
  "Software Engineering", "Geography", "French Continuers", "Visual Arts", "PDHPE",
];

export const UTILISATION_LEVELS = [0.5, 0.7, 0.85, 0.95, 1.1] as const;

function round15(minutes: number) {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

/** Study minutes the horizon can hold: per day, the smaller of the cap and the free time. */
export function capacity(instance: Instance, commitments: CommitmentSpec[]): number {
  const dates = horizonDates(instance);
  const busy = [...commitmentIntervals(commitments, dates, instance.tz), ...sleepIntervals(instance, dates)];
  let total = 0;
  for (const date of dates.slice(1)) {
    const start = localToUtc(date, 0, instance.tz);
    const end = localToUtc(addDays(date, 1), 0, instance.tz);
    let free: Interval[] = [{ start, end }];
    for (const b of busy) free = subtract(free, b);
    const minutes = free.reduce((s, f) => s + (f.end - f.start) / MINUTE, 0);
    total += Math.min(instance.cap, minutes);
  }
  return total;
}

export function generate(seed: number): Instance {
  const r = rng(seed);
  const tz = r.pick(ZONES);
  const changeWeek = r.next() < 0.3;
  const startDate = r.pick(changeWeek ? CHANGE_STARTS : NORMAL_STARTS);
  const days = 28;
  const start = localToUtc(startDate, 0, tz);
  const end = localToUtc(addDays(startDate, days), 0, tz);

  const commitments: CommitmentSpec[] = [];
  const schoolStart = r.pick([480, 495, 510, 525, 540]);
  const schoolEnd = r.pick([885, 900, 915, 930]);
  commitments.push({
    id: "c-school", title: "School", category: "school", recurrence: "weekdays",
    weekday: null, date: null, start: clockOf(schoolStart), end: clockOf(schoolEnd),
  });
  const sport = r.int(0, 3);
  for (let i = 0; i < sport; i++) {
    const weekend = r.next() < 0.3;
    const s = weekend ? r.pick([480, 540, 600]) : r.pick([960, 990, 1020, 1050]);
    commitments.push({
      id: `c-sport-${i}`, title: "Training", category: "sport", recurrence: "weekly",
      weekday: weekend ? r.pick([0, 6]) : r.int(1, 5), date: null,
      start: clockOf(s), end: clockOf(s + r.pick([60, 90, 120])),
    });
  }
  const shifts = r.int(0, 3);
  for (let i = 0; i < shifts; i++) {
    const weekend = r.next() < 0.5;
    const s = weekend ? r.pick([540, 600, 660]) : r.pick([1020, 1050]);
    commitments.push({
      id: `c-work-${i}`, title: "Work shift", category: "work", recurrence: "weekly",
      weekday: weekend ? r.pick([0, 6]) : r.int(1, 5), date: null,
      start: clockOf(s), end: clockOf(Math.min(s + r.pick([180, 240, 300]), 22 * 60)),
    });
  }
  if (r.next() < 0.5) {
    const s = r.pick([1080, 1110, 1140]);
    commitments.push({
      id: "c-other-0", title: "Tutoring", category: "other", recurrence: "weekly",
      weekday: r.int(1, 5), date: null, start: clockOf(s), end: clockOf(s + 60),
    });
  }

  const bedtime = r.pick(["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "00:30"]);
  const wake = r.pick(["06:00", "06:30", "07:00", "07:30"]);
  const cap = r.pick([90, 120, 150, 180, 210, 240]);
  const session = r.pick([30, 40, 45, 50, 60]);
  const breakMinutes = r.pick([5, 10, 15]);
  const utilisation = UTILISATION_LEVELS[seed % UTILISATION_LEVELS.length];
  const clustered = r.next() < 0.4;

  const base: Instance = {
    id: `i${seed}`, seed, tz, startDate, start, end, days, bedtime, wake, cap, session, breakMinutes,
    subjects: [], commitments, tasks: [], utilisation, clustered,
    crossesClockChange: offsetAt(tz, start) !== offsetAt(tz, end),
  };

  const cap28 = capacity(base, commitments);
  const subjectCount = r.int(4, 8);
  const names = [...SUBJECT_NAMES].sort(() => r.next() - 0.5).slice(0, subjectCount);
  // Subjects take about a third of the horizon's room; deadline work fills to the utilisation level.
  const weekly = Math.min(240, Math.max(60, round15((0.35 * cap28) / 4 / subjectCount)));
  const subjects: SubjectSpec[] = names.map((name) => ({ name, weekly, priority: r.int(1, 3) }));
  const subjectTotal = weekly * 4 * subjectCount;

  const taskTotal = Math.max(6 * 30, utilisation * cap28 - subjectTotal);
  const taskCount = Math.min(20, Math.max(6, Math.round(taskTotal / 120)));
  const weights = Array.from({ length: taskCount }, () => 0.3 + r.next());
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const centres = [r.int(7, 12), r.int(18, 25)];
  const tasks: TaskSpec[] = weights.map((w, i) => {
    const day = clustered
      ? Math.min(days - 1, Math.max(2, r.pick(centres) + r.int(-2, 2)))
      : r.int(2, days - 1);
    const date = addDays(startDate, day);
    const dueClock = r.next() < 0.7 ? 23 * 60 + 59 : 8 * 60 + 30;
    return {
      id: `t${i}`,
      title: `Task ${i + 1}`,
      subject: r.pick(names),
      dueAt: localToUtc(date, dueClock, tz),
      minutes: Math.min(360, Math.max(30, round15((taskTotal * w) / weightSum))),
      priority: r.int(1, 3),
      releaseAt: start,
    };
  });

  return { ...base, subjects, tasks };
}

function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Actual utilisation: required study over capacity. */
export function utilisationOf(instance: Instance): number {
  const required =
    instance.tasks.reduce((s, t) => s + t.minutes, 0) +
    instance.subjects.reduce((s, x) => s + x.weekly * 4, 0);
  return required / capacity(instance, instance.commitments);
}
