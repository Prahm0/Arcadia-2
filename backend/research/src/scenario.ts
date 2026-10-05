/**
 * Turns an instance into a disruption scenario (PROTOCOL.md section 4) and
 * the state every repair method starts from.
 */
import { startingPlan } from "./arcadia.ts";
import { commitmentIntervals, horizonDates, overlaps, type Interval } from "./calendar.ts";
import { generate, rng, type Rng } from "./generate.ts";
import { addDays, clock, localDate, localMinutes, localToUtc } from "./localtime.ts";
import type { Block, CommitmentSpec, Disruption, DisruptionType, Instance, RepairState, Scenario } from "./types.ts";
import { MINUTE } from "./types.ts";

const LABELS = ["D1", "D2", "D3", "D4", "D5", "D6"] as const;

function makeDisruption(type: DisruptionType, instance: Instance, at: number, plan: Block[], r: Rng): Disruption | null {
  const tz = instance.tz;
  const today = localDate(at, tz);
  const nowClock = Math.ceil(localMinutes(at, tz) / 5) * 5;
  switch (type) {
    case "D1": {
      // The most recent block that already finished, preferring today (as recoverPlan does).
      const past = plan.filter((b) => b.end <= at).sort((a, b) => b.start - a.start);
      const missed = past.find((b) => localDate(b.start, tz) === today) ?? past[0];
      return missed ? { type, missedBlockId: missed.id } : null;
    }
    case "D2": {
      const date = addDays(today, r.int(0, 2));
      let start = r.pick([480, 600, 720, 900, 1020, 1140, 1200]);
      if (date === today) start = Math.max(start, nowClock);
      const end = Math.min(start + r.pick([60, 90, 120, 180, 240]), 23 * 60 + 59);
      if (end - start < 30) return null;
      return {
        type,
        commitment: {
          id: "c-new", title: "Something came up", category: "other", recurrence: "none",
          weekday: null, date, start: clock(start), end: clock(end),
        },
      };
    }
    case "D3": {
      if (nowClock >= 23 * 60 + 30) return null;
      return {
        type,
        commitment: {
          id: "c-rest", title: "Time off", category: "rest", recurrence: "none",
          weekday: null, date: today, start: clock(nowClock), end: "23:59",
        },
      };
    }
    case "D4": {
      const movable = instance.commitments.filter((c) => c.recurrence === "weekly");
      if (movable.length === 0) {
        // No weekly commitment: school now runs an hour or two later every day.
        const school = instance.commitments.find((c) => c.id === "c-school")!;
        const [h, m] = school.end.split(":").map(Number);
        return {
          type,
          replacesCommitmentId: school.id,
          commitment: { ...school, end: clock(h * 60 + m + r.pick([60, 90, 120])) },
        };
      }
      const old = r.pick(movable);
      const [h, m] = old.start.split(":").map(Number);
      const [eh, em] = old.end.split(":").map(Number);
      const shift = r.pick([60, 120, 180]);
      const start = Math.min(h * 60 + m + shift, 21 * 60);
      const length = eh * 60 + em - (h * 60 + m);
      return {
        type,
        replacesCommitmentId: old.id,
        commitment: {
          ...old,
          weekday: r.next() < 0.5 ? old.weekday : ((old.weekday ?? 1) + r.int(1, 5)) % 7,
          start: clock(start),
          end: clock(Math.min(start + length, 23 * 60 + 59)),
        },
      };
    }
    case "D5": {
      const due = addDays(today, r.int(1, 7));
      return {
        type,
        task: {
          id: "t-new",
          title: "New task",
          subject: r.pick(instance.subjects).name,
          dueAt: localToUtc(due, 23 * 60 + 59, tz),
          minutes: r.pick([60, 90, 120, 150, 180, 210, 240]),
          priority: r.int(1, 3),
          releaseAt: at,
        },
      };
    }
  }
}

export function applyDisruptions(instance: Instance, disruptions: Disruption[]) {
  let commitments: CommitmentSpec[] = [...instance.commitments];
  let tasks = [...instance.tasks];
  for (const d of disruptions) {
    if (d.replacesCommitmentId) commitments = commitments.filter((c) => c.id !== d.replacesCommitmentId);
    if (d.commitment) commitments.push(d.commitment);
    if (d.task) tasks.push(d.task);
  }
  return { commitments, tasks };
}

export function buildScenario(seed: number): Scenario {
  const instance = generate(seed);
  const startPlan = startingPlan(instance).filter((b) => b.start < instance.end);
  const r = rng(seed * 7919 + 17);
  const day = r.int(1, 7);
  const at = localToUtc(addDays(instance.startDate, day), r.int(28, 84) * 15, instance.tz);

  const label = LABELS[seed % LABELS.length];
  const wanted: DisruptionType[] =
    label === "D6"
      ? (() => {
          const pool: DisruptionType[] = ["D1", "D2", "D3", "D4", "D5"];
          const a = r.pick(pool);
          const b = r.pick(pool.filter((x) => x !== a && !(x === "D2" && a === "D3") && !(x === "D3" && a === "D2")));
          return [a, b];
        })()
      : [label];
  const disruptions = wanted
    .map((type) => makeDisruption(type, instance, at, startPlan, r))
    .filter((d): d is Disruption => d !== null);

  // Severity: planned study the disruption invalidates, or the new work it adds.
  const { commitments } = applyDisruptions(instance, disruptions);
  const dates = horizonDates(instance);
  const before = commitmentIntervals(instance.commitments, dates, instance.tz);
  const after = commitmentIntervals(commitments, dates, instance.tz);
  const fresh: Interval[] = after.filter((a) => !before.some((b) => b.start === a.start && b.end === a.end));
  let severityMinutes = 0;
  for (const b of startPlan) {
    if (b.start < at) continue;
    if (fresh.some((f) => overlaps(f, b))) severityMinutes += (b.end - b.start) / MINUTE;
  }
  for (const d of disruptions) {
    if (d.missedBlockId) {
      const m = startPlan.find((b) => b.id === d.missedBlockId);
      if (m) severityMinutes += (m.end - m.start) / MINUTE;
    }
    if (d.task) severityMinutes += d.task.minutes;
  }
  const severity = severityMinutes < 60 ? "light" : severityMinutes <= 180 ? "medium" : "heavy";

  return {
    instance, startPlan, at, disruptions,
    label: disruptions.length ? (label === "D6" ? "D6" : disruptions[0].type) : "none",
    severity, severityMinutes,
  };
}

/** What every method starts from: the same disrupted copy. */
export function repairState(s: Scenario): RepairState {
  const { commitments, tasks } = applyDisruptions(s.instance, s.disruptions);
  const missedBlockId = s.disruptions.find((d) => d.missedBlockId)?.missedBlockId ?? null;
  const fixed = s.startPlan.filter((b) => b.start < s.at).map((b) => ({ ...b, fixed: true }));
  const done = new Map<string, number>();
  for (const b of fixed) {
    if (!b.taskId || b.id === missedBlockId || b.end > s.at) continue;
    done.set(b.taskId, (done.get(b.taskId) ?? 0) + (b.end - b.start) / MINUTE);
  }
  return {
    instance: s.instance,
    now: s.at,
    commitments,
    tasks,
    done,
    fixed,
    current: s.startPlan.filter((b) => b.start >= s.at),
    missedBlockId,
  };
}
