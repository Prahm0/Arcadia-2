/**
 * Independent hard-constraint validator (PROTOCOL.md section 3).
 *
 * Shares no code with any scheduler, including the harness's own baselines:
 * it has its own local-time conversion and its own busy-time calculation.
 * If a scheduler and this file disagree, one of them is wrong, and the
 * disagreement is the finding.
 */
import type { Block, CommitmentSpec, Instance, TaskSpec } from "./types.ts";

const MIN = 60_000;
const DAY_MS = 86_400_000;

// --- Local time, written separately from localtime.ts on purpose. ---
const cache = new Map<string, Intl.DateTimeFormat>();
function zoneMinutes(tz: string, at: number): number {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
    });
    cache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((wall - (at - (at % MIN))) / MIN);
}
/** Every instant whose local wall time is `date` + `minutes`; the earliest one. Gap times move forward. */
function wallToInstant(date: string, minutes: number, tz: string): number {
  const wall = Date.parse(`${date}T00:00:00Z`) + minutes * MIN;
  // Offsets in use are within +-15h; try each candidate offset seen near this wall time.
  const candidates = new Set<number>();
  for (const probe of [wall - DAY_MS, wall, wall + DAY_MS]) candidates.add(zoneMinutes(tz, probe));
  const exact = [...candidates].map((o) => wall - o * MIN).filter((t) => zoneMinutes(tz, t) * MIN === wall - t);
  if (exact.length) return Math.min(...exact);
  // Inside a spring-forward gap: the first valid instant after it.
  return Math.max(...[...candidates].map((o) => wall - o * MIN));
}
function dayKey(at: number, tz: string): string {
  return new Date(at + zoneMinutes(tz, at) * MIN).toISOString().slice(0, 10);
}
function shift(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
function mins(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export interface Violations {
  commitment: number;
  sleep: number;
  studyOverlap: number;
  break: number;
  cap: number;
  late: number;
  release: number;
  short: number;
  past: number;
  unknown: number;
  /** Minutes involved, all kinds together. */
  minutes: number;
  total: number;
  notes: string[];
}

export function validate(
  instance: Instance,
  commitments: CommitmentSpec[],
  tasks: TaskSpec[],
  fixed: Block[],
  blocks: Block[],
  now: number,
  missedBlockId: string | null,
): Violations {
  const v: Violations = {
    commitment: 0, sleep: 0, studyOverlap: 0, break: 0, cap: 0, late: 0, release: 0, short: 0, past: 0, unknown: 0,
    minutes: 0, total: 0, notes: [],
  };
  const tz = instance.tz;
  const add = (kind: keyof Omit<Violations, "minutes" | "total" | "notes">, minutes: number, note: string) => {
    v[kind]++;
    v.minutes += minutes;
    v.total++;
    if (v.notes.length < 5) v.notes.push(note);
  };
  const dates = Array.from({ length: instance.days + 2 }, (_, i) => shift(instance.startDate, i - 1));

  const busyCommit: Array<{ s: number; e: number; t: string }> = [];
  for (const c of commitments) {
    for (const d of dates) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      const on =
        c.recurrence === "weekdays" ? wd >= 1 && wd <= 5 : c.recurrence === "weekly" ? wd === c.weekday : d === c.date;
      if (!on || mins(c.end) <= mins(c.start)) continue;
      busyCommit.push({ s: wallToInstant(d, mins(c.start), tz), e: wallToInstant(d, mins(c.end), tz), t: c.title });
    }
  }
  const bed = mins(instance.bedtime);
  const wake = mins(instance.wake);
  const busySleep = dates.map((d) => ({
    s: wallToInstant(d, bed, tz),
    e: wallToInstant(wake > bed ? d : shift(d, 1), wake, tz),
  }));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const over = (a: { s: number; e: number }, b: Block) => Math.max(0, Math.min(a.e, b.end) - Math.max(a.s, b.start)) / MIN;

  for (const b of blocks) {
    const label = `${dayKey(b.start, tz)} ${b.taskId ?? b.subject}`;
    if (b.start < now) add("past", (b.end - b.start) / MIN, `${label}: starts before now`);
    if (b.end - b.start < 15 * MIN) add("short", (b.end - b.start) / MIN, `${label}: under 15 min`);
    for (const c of busyCommit) {
      const m = over(c, b);
      if (m > 0) add("commitment", m, `${label}: ${m} min over ${c.t}`);
    }
    for (const s of busySleep) {
      const m = over(s, b);
      if (m > 0) add("sleep", m, `${label}: ${m} min in sleep`);
    }
    if (b.taskId) {
      const t = taskById.get(b.taskId);
      if (!t) add("unknown", 0, `${label}: unknown task`);
      else {
        if (b.end > t.dueAt) add("late", (b.end - Math.max(b.start, t.dueAt)) / MIN, `${label}: ends after due`);
        if (b.start < t.releaseAt) add("release", (t.releaseAt - b.start) / MIN, `${label}: before the task existed`);
      }
    }
  }

  // Study against study: overlaps and breaks, including fixed blocks that happened.
  const all = [...fixed.filter((b) => b.id !== missedBlockId), ...blocks].sort((a, b) => a.start - b.start);
  const gap = instance.breakMinutes * MIN;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1];
    const b = all[i];
    if (!blocks.includes(b) && !blocks.includes(a)) continue; // both fixed: not this method's doing
    if (b.start < a.end) add("studyOverlap", (Math.min(a.end, b.end) - b.start) / MIN, `${dayKey(b.start, tz)}: study blocks overlap`);
    else if (b.start - a.end < gap) add("break", 0, `${dayKey(b.start, tz)}: ${(b.start - a.end) / MIN} min break, needs ${instance.breakMinutes}`);
  }

  // Daily cap, per local date, counting what already happened that day.
  const perDay = new Map<string, number>();
  for (const b of all) perDay.set(dayKey(b.start, tz), (perDay.get(dayKey(b.start, tz)) ?? 0) + (b.end - b.start) / MIN);
  const touched = new Set(blocks.map((b) => dayKey(b.start, tz)));
  for (const [day, total] of perDay) {
    if (touched.has(day) && total > instance.cap + 0.01) add("cap", total - instance.cap, `${day}: ${total} min > cap ${instance.cap}`);
  }
  return v;
}
