/** Measures from PROTOCOL.md sections 7 and 8. */
import { localDate } from "./localtime.ts";
import type { Block, RepairState } from "./types.ts";
import { DAY, MINUTE } from "./types.ts";

export interface Metrics {
  coverage: number; // weighted on-time preparation coverage, 0..1
  unmetWeighted: number; // weighted unmet deadline minutes
  unmet: number; // unmet deadline minutes
  fullyPrepared: number; // share of tasks with all required prep on time
  unchanged: number; // share of original blocks unchanged
  moved: number;
  removed: number;
  added: number; // count of new blocks
  displacement: number; // total |start shift| minutes over moved blocks
  dayChanges: number;
  cost: number; // near-term-weighted disruption cost
  subjectError: number; // mean shortfall below target, as a share of target, over the remaining horizon
  starved: number; // share of subjects under 50% of target
}

// PROTOCOL.md amendment 2: every term is bounded, so moving a block never
// costs more than removing it.
const COST = { a: 4, c: 3, e: 1, d: 1 };

const identity = (b: Block) => (b.taskId ? `t:${b.taskId}` : `s:${(b.subject ?? "").toLowerCase()}`);

export function measure(state: RepairState, repaired: Block[]): Metrics {
  const { instance, now } = state;
  // Coverage counts tasks still due after the disruption.
  const live = state.tasks.filter((t) => t.dueAt > now);
  const happened = state.fixed.filter((b) => b.id !== state.missedBlockId);
  let wTotal = 0, wCovered = 0, unmetW = 0, unmet = 0, full = 0;
  for (const t of live) {
    const booked = [...happened, ...repaired]
      .filter((b) => b.taskId === t.id && b.end <= t.dueAt && b.start >= t.releaseAt)
      .reduce((s, b) => s + (b.end - b.start) / MINUTE, 0);
    const got = Math.min(t.minutes, booked);
    wTotal += t.priority * t.minutes;
    wCovered += t.priority * got;
    unmetW += t.priority * (t.minutes - got);
    unmet += t.minutes - got;
    if (got >= t.minutes - 0.5) full++;
  }

  // Stability: match the original plan's blocks (from now on) to the repaired ones.
  const original = state.current;
  const pool = new Map<string, Block[]>();
  for (const b of repaired) pool.set(identity(b), [...(pool.get(identity(b)) ?? []), b]);
  let unchanged = 0, moved = 0, removed = 0, displacement = 0, dayChanges = 0, cost = 0;
  const weight = (b: Block) => 1 / (1 + Math.max(0, (b.start - now) / DAY));
  const leftover: Block[] = [];
  for (const o of original) {
    const candidates = pool.get(identity(o)) ?? [];
    const same = candidates.findIndex((r) => r.start === o.start && r.end === o.end);
    if (same >= 0) {
      candidates.splice(same, 1);
      unchanged++;
    } else leftover.push(o);
  }
  const dayOf = (at: number) => localDate(at, instance.tz);
  for (const o of leftover) {
    const candidates = pool.get(identity(o)) ?? [];
    if (candidates.length === 0) {
      removed++;
      cost += weight(o) * COST.a;
      continue;
    }
    candidates.sort((x, y) => Math.abs(x.start - o.start) - Math.abs(y.start - o.start));
    const r = candidates.shift()!;
    moved++;
    const shiftMinutes = Math.abs(r.start - o.start) / MINUTE;
    displacement += shiftMinutes;
    const dayChanged = dayOf(r.start) !== dayOf(o.start);
    if (dayChanged) dayChanges++;
    cost += weight(o) * (dayChanged ? COST.c : (COST.e * Math.min(shiftMinutes, 120)) / 60);
  }
  const newBlocks = [...pool.values()].flat();
  const added = newBlocks.length;
  for (const b of newBlocks) cost += weight(b) * COST.d;
  const n = original.length || 1;

  // Subject balance over the rest of the horizon: all study counted toward its subject.
  const remainingWeeks = Math.max(0, (instance.end - now) / (7 * DAY));
  let errSum = 0, starved = 0;
  for (const s of instance.subjects) {
    const target = s.weekly * remainingWeeks;
    const booked = repaired
      .filter((b) => (b.subject ?? "").toLowerCase() === s.name.toLowerCase() && b.start < instance.end)
      .reduce((sum, b) => sum + (b.end - b.start) / MINUTE, 0);
    // Shortfall only: deadline work in a subject counts toward it, so extra is not a failure.
    errSum += target > 0 ? Math.max(0, target - booked) / target : 0;
    if (target > 0 && booked < 0.5 * target) starved++;
  }

  return {
    coverage: wTotal ? wCovered / wTotal : 1,
    unmetWeighted: unmetW,
    unmet,
    fullyPrepared: live.length ? full / live.length : 1,
    unchanged: unchanged / n,
    moved: moved / n,
    removed: removed / n,
    added,
    displacement,
    dayChanges,
    cost,
    subjectError: instance.subjects.length ? errSum / instance.subjects.length : 0,
    starved: instance.subjects.length ? starved / instance.subjects.length : 0,
  };
}
