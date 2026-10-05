/**
 * Baseline repair methods (PROTOCOL.md section 6). Written for this harness,
 * independent of Arcadia's scheduler.
 *
 *  M0  No repair: drop what the disruption broke, add nothing.
 *  M1  Greedy EDF insertion: keep every valid block, then put outstanding
 *      deadline work into the earliest free gaps, most urgent first.
 *  M3  Coverage-first rebuild: throw away every movable block and rebuild
 *      from scratch, deadline work first (EDF), then subject time.
 */
import { book, commitmentIntervals, freeDays, horizonDates, overlaps, sleepIntervals, subtract, type Day } from "./calendar.ts";
import type { Block, RepairMethod, RepairState, TaskSpec } from "./types.ts";
import { DAY, MINUTE } from "./types.ts";

/** Blocks from the current plan that still fit after the disruption. */
export function stillValid(state: RepairState): Block[] {
  const { instance } = state;
  const dates = horizonDates(instance);
  const busy = [...commitmentIntervals(state.commitments, dates, instance.tz), ...sleepIntervals(instance, dates)];
  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  // Also drops blocks the starting plan already had wrong (deadline work
  // booked after its due time), so baselines don't inherit Arcadia's defects.
  return state.current.filter((b) => {
    const t = b.taskId ? tasks.get(b.taskId) : null;
    return (
      b.start >= state.now &&
      !busy.some((x) => overlaps(x, b)) &&
      (!b.taskId || (t !== undefined && t !== null && b.end <= t.dueAt))
    );
  });
}

/** Minutes of each task still to place, given what's done and what's kept. */
export function outstanding(state: RepairState, kept: Block[]): Map<string, number> {
  const out = new Map<string, number>();
  const happened = state.fixed.filter((b) => b.id !== state.missedBlockId);
  for (const t of state.tasks) {
    if (t.dueAt <= state.now) continue;
    const have = [...happened, ...kept]
      .filter((b) => b.taskId === t.id && b.end <= t.dueAt)
      .reduce((s, b) => s + (b.end - b.start) / MINUTE, 0);
    if (t.minutes - have >= 15) out.set(t.id, t.minutes - have);
  }
  return out;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}${++counter}`;

/**
 * Places one block of up to `want` minutes in the earliest gap that fits
 * before `before` and after `after`. Returns null when nothing fits.
 */
export function earliest(
  days: Day[], want: number, after: number, before: number, cap: number, breakMinutes: number, left = want,
) {
  for (const day of days) {
    const room = cap - day.used;
    if (room < 15) continue;
    for (const f of day.free) {
      const start = Math.max(f.start, Math.ceil(after / (5 * MINUTE)) * 5 * MINUTE);
      const end = Math.min(f.end, before);
      let length = Math.min(want, room, (end - start) / MINUTE);
      // Never leave a tail too short to book (under 15 minutes) behind.
      if (left - length > 0 && left - length < 15) length = left - 15;
      if (length < 15) continue;
      const rounded = Math.floor(length / 5) * 5;
      const block = { start, end: start + rounded * MINUTE };
      book(day, block, breakMinutes);
      // A block that ends at midnight still needs its break at the start of
      // the next day (amendment 4: found by the validator in 6 of 5,000 runs).
      for (const other of days) {
        if (other === day) continue;
        other.free = subtract(other.free, { start: block.start - breakMinutes * MINUTE, end: block.end + breakMinutes * MINUTE })
          .filter((f) => f.end - f.start >= 15 * MINUTE);
      }
      return block;
    }
  }
  return null;
}

/** EDF: most urgent first, highest priority on ties, earliest gaps. */
export function edfFill(state: RepairState, days: Day[], need: Map<string, number>): Block[] {
  const { instance } = state;
  const out: Block[] = [];
  const order: TaskSpec[] = state.tasks
    .filter((t) => need.has(t.id))
    .sort((a, b) => a.dueAt - b.dueAt || b.priority - a.priority);
  for (const t of order) {
    let left = need.get(t.id)!;
    while (left >= 15) {
      const want = left - instance.session < 15 ? left : instance.session;
      const block = earliest(days, want, Math.max(state.now, t.releaseAt), t.dueAt, instance.cap, instance.breakMinutes, left);
      if (!block) break;
      out.push({ id: nextId("e"), ...block, taskId: t.id, subject: t.subject, fixed: false });
      left -= (block.end - block.start) / MINUTE;
    }
  }
  return out;
}

const occupied = (state: RepairState, extra: Block[]) => [
  ...state.fixed.filter((b) => b.id !== state.missedBlockId),
  ...extra,
];

export const noRepair: RepairMethod = {
  code: "M0",
  name: "No repair",
  repair: (state) => stillValid(state),
};

export const edfInsert: RepairMethod = {
  code: "M1",
  name: "Greedy EDF insertion",
  repair(state) {
    const kept = stillValid(state);
    const days = freeDays(state.instance, state.commitments, occupied(state, kept), state.now);
    return [...kept, ...edfFill(state, days, outstanding(state, kept))];
  },
};

export const coverageFirst: RepairMethod = {
  code: "M3",
  name: "Coverage-first rebuild",
  repair(state) {
    const { instance } = state;
    const days = freeDays(instance, state.commitments, occupied(state, []), state.now);
    const placed = edfFill(state, days, outstanding(state, []));
    // Then subject time, round robin, toward each subject's target for the rest of the horizon.
    const weeks = Math.max(0, (instance.end - state.now) / (7 * DAY));
    const left = new Map(
      instance.subjects.map((s) => {
        const already = placed.filter((b) => b.subject === s.name).reduce((sum, b) => sum + (b.end - b.start) / MINUTE, 0);
        return [s.name, Math.max(0, s.weekly * weeks - already)];
      }),
    );
    for (let progress = true; progress; ) {
      progress = false;
      for (const s of instance.subjects) {
        const want = Math.min(left.get(s.name)!, instance.session);
        if (want < 25) continue;
        const block = earliest(days, want, state.now, instance.end, instance.cap, instance.breakMinutes);
        if (!block) continue;
        placed.push({ id: nextId("s"), ...block, taskId: null, subject: s.name, fixed: false });
        left.set(s.name, left.get(s.name)! - (block.end - block.start) / MINUTE);
        progress = true;
      }
    }
    return placed;
  },
};
