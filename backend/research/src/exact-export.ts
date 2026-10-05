/**
 * Exports small disrupted scenarios as slot problems for the exact optimiser
 * (research/analysis/exact_solve.py), PROTOCOL.md amendment 6.
 *
 *   node research/exact.mjs export <from> <to> > problems.json
 *
 * Time is cut into 5-minute slots from the moment of the disruption to the
 * end of the horizon. The optimiser chooses which of the original blocks to
 * keep exactly where they are, and which slots to fill with deadline work,
 * under the same hard rules the validator checks.
 */
import { stillValid } from "./baselines.ts";
import { commitmentIntervals, horizonDates, sleepIntervals } from "./calendar.ts";
import type { GenerateOptions } from "./generate.ts";
import { localDate } from "./localtime.ts";
import { buildScenario, repairState } from "./scenario.ts";
import { MINUTE } from "./types.ts";

export const SMALL: GenerateOptions = { days: 14, maxTasks: 10, minTasks: 4, maxSubjects: 6 };
/** FULL=1 uses the confirmatory benchmark's own 28-day scenarios. */
export const OPTIONS: GenerateOptions = process.env.FULL === "1" ? {} : SMALL;
const SLOT = 5 * MINUTE;

export function slotProblem(seed: number) {
  const scenario = buildScenario(seed, OPTIONS);
  const state = repairState(scenario);
  const { instance } = state;
  const tz = instance.tz;
  const t0 = Math.ceil(state.now / SLOT) * SLOT;
  const n = Math.floor((instance.end - t0) / SLOT);
  const dates = horizonDates(instance);
  const busy = [...commitmentIntervals(state.commitments, dates, tz), ...sleepIntervals(instance, dates)];
  const fixed = state.fixed.filter((b) => b.id !== state.missedBlockId);
  const pad = instance.breakMinutes * MINUTE;

  const dayOf: number[] = [];
  const dayKeys: string[] = [];
  const available: boolean[] = [];
  for (let s = 0; s < n; s++) {
    const a = t0 + s * SLOT, b = a + SLOT;
    const key = localDate(a, tz);
    if (dayKeys[dayKeys.length - 1] !== key) dayKeys.push(key);
    dayOf.push(dayKeys.length - 1);
    const clash = busy.some((x) => x.start < b && x.end > a);
    // Fixed study (done or under way) and the break after it are off limits.
    const nearFixed = fixed.some((f) => f.start - pad < b && f.end + pad > a);
    available.push(!clash && !nearFixed);
  }
  // Study already counted against each day's cap (by start day, as the validator counts).
  const capLeft = dayKeys.map((k) => {
    const used = fixed.filter((f) => localDate(f.start, tz) === k).reduce((sum, f) => sum + (f.end - f.start) / MINUTE, 0);
    return Math.max(0, instance.cap - used);
  });

  const done = new Map<string, number>();
  for (const f of fixed) if (f.taskId) done.set(f.taskId, (done.get(f.taskId) ?? 0) + (f.end - f.start) / MINUTE);
  const tasks = state.tasks
    .filter((t) => t.dueAt > state.now)
    .map((t) => {
      const releaseSlot = Math.max(0, Math.ceil((t.releaseAt - t0) / SLOT));
      const dueSlot = Math.min(n - 1, Math.floor((t.dueAt - t0) / SLOT) - 1); // last slot ending by the due time
      return { id: t.id, priority: t.priority, required: t.minutes, done: done.get(t.id) ?? 0, releaseSlot, dueSlot };
    });

  const valid = new Set(stillValid(state).map((b) => b.id));
  const originals = state.current
    .filter((b) => b.start < instance.end)
    .map((b) => {
      const startSlot = (b.start - t0) / SLOT;
      const len = (b.end - b.start) / SLOT;
      const aligned = Number.isInteger(startSlot) && Number.isInteger(len) && startSlot >= 0 && startSlot + len <= n;
      const free = aligned && Array.from({ length: len }, (_, i) => available[startSlot + i]).every(Boolean);
      return { id: b.id, taskId: b.taskId, subject: b.subject, startSlot, len, keepable: valid.has(b.id) && free };
    });

  return {
    seed, t0, n, slotMinutes: 5, breakSlots: Math.round(instance.breakMinutes / 5), dayOf, capLeft, available,
    tasks, originals, utilisation: instance.utilisation, label: scenario.label,
  };
}

const [mode, from, to] = process.argv.slice(2);
if (mode === "export") {
  const out = [];
  for (let seed = Number(from); seed <= Number(to); seed++) out.push(slotProblem(seed));
  process.stdout.write(JSON.stringify(out));
}
