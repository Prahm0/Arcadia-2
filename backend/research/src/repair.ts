/**
 * M4: stability-budgeted repair, and the infeasibility certificate.
 *
 * The idea: the student's existing plan is worth protecting. Instead of
 * rebuilding the week, repair only what the disruption broke, spend as
 * little "disruption" as possible doing it, and never more than a budget.
 *
 *   1. Keep every block that still works.
 *   2. Work out exactly what is now unbooked.
 *   3. Put it back locally first: the gap closest to where the lost work
 *      was, then widening outward day by day (the neighbourhood).
 *   4. If no gap fits before the due time, bump a less urgent block
 *      (subject time, or work due later) and re-place that block nearby.
 *   5. Every change has a cost, weighted so changes to the next few days
 *      cost more than changes weeks away. Stop when the budget is spent.
 *
 * The certificate answers "can this week fit at all?" independently of any
 * repair: for each deadline, the work that must be done by then against
 * the study time that exists before then.
 */
import { commitmentIntervals, horizonDates, sleepIntervals, subtract, type Interval } from "./calendar.ts";
import { stillValid, outstanding } from "./baselines.ts";
import { addDays, localDate, localToUtc } from "./localtime.ts";
import type { Block, RepairMethod, RepairState, TaskSpec } from "./types.ts";
import { DAY, MINUTE } from "./types.ts";

export interface RepairOptions {
  /** Most disruption cost the repair may spend. Infinity = only what coverage needs. */
  budget: number;
  /** Ablation: weight every change the same, wherever it is. */
  nearTermWeighting: boolean;
  /** Ablation: never bump another block. */
  ejection: boolean;
  /** Ablation: search only a fixed window of days around the lost work. */
  widening: boolean;
}

export const DEFAULTS: RepairOptions = { budget: Infinity, nearTermWeighting: true, ejection: true, widening: true };

const FIXED_WINDOW_DAYS = 1;
const MAX_EJECT_CANDIDATES = 60;
/** How long a chain of bumps may get: A bumps B, B bumps C. */
const CHAIN_DEPTH = 2;

interface Ctx {
  state: RepairState;
  opts: RepairOptions;
  dates: string[];
  bounds: Map<string, { start: number; end: number }>;
  busy: Map<string, Interval[]>;
  /** Study that already happened or is under way: fixed, counts toward caps and breaks. */
  fixed: Block[];
  original: Map<string, Block>;
  spent: number;
  counter: number;
}

const ceil5 = (t: number) => Math.ceil(t / (5 * MINUTE)) * 5 * MINUTE;

function weight(ctx: Ctx, at: number): number {
  if (!ctx.opts.nearTermWeighting) return 1;
  return 1 / (1 + Math.max(0, (at - ctx.state.now) / DAY));
}

/** What a block's position costs against where it started (same scale as metrics.ts). */
function positionCost(ctx: Ctx, b: Block | null, original: Block | undefined): number {
  if (!original) return b ? weight(ctx, b.start) : 0; // a new block
  if (!b) return 4 * weight(ctx, original.start); // removed
  if (b.start === original.start && b.end === original.end) return 0;
  const tz = ctx.state.instance.tz;
  if (localDate(b.start, tz) !== localDate(original.start, tz)) return 3 * weight(ctx, original.start);
  return (Math.min(Math.abs(b.start - original.start) / MINUTE, 120) / 60) * weight(ctx, original.start);
}

function makeCtx(state: RepairState, opts: RepairOptions): Ctx {
  const { instance } = state;
  const all = horizonDates(instance);
  const busyAll = [...commitmentIntervals(state.commitments, all, instance.tz), ...sleepIntervals(instance, all)];
  const today = localDate(state.now, instance.tz);
  const dates = all.filter((d) => d >= today);
  const bounds = new Map<string, { start: number; end: number }>();
  const busy = new Map<string, Interval[]>();
  for (const d of dates) {
    const start = localToUtc(d, 0, instance.tz);
    const end = localToUtc(addDays(d, 1), 0, instance.tz);
    bounds.set(d, { start, end });
    busy.set(d, busyAll.filter((b) => b.start < end && b.end > start));
  }
  return {
    state, opts, dates, bounds, busy,
    fixed: state.fixed.filter((b) => b.id !== state.missedBlockId),
    original: new Map(state.current.map((b) => [b.id, b])),
    spent: 0,
    counter: 0,
  };
}

/** Free time on a day and study minutes already used, given the working plan. */
function dayView(ctx: Ctx, date: string, plan: Block[]) {
  const { start, end } = ctx.bounds.get(date)!;
  const pad = ctx.state.instance.breakMinutes * MINUTE;
  let free: Interval[] = [{ start: Math.max(start, ceil5(ctx.state.now)), end }];
  for (const b of ctx.busy.get(date)!) free = subtract(free, b);
  let used = 0;
  for (const b of [...ctx.fixed, ...plan]) {
    if (b.end + pad <= start || b.start - pad >= end) continue;
    free = subtract(free, { start: b.start - pad, end: b.end + pad });
    if (b.start >= start && b.start < end) used += (b.end - b.start) / MINUTE;
  }
  return { free: free.filter((f) => f.end - f.start >= 15 * MINUTE), used };
}

/**
 * The best spot for a block of `want` minutes (at least 15) on one day,
 * between `after` and `before`, as close to `near` as it can be.
 */
function spotOn(
  ctx: Ctx, date: string, plan: Block[], want: number, after: number, before: number, near: number, left = want,
): Interval | null {
  const { free, used } = dayView(ctx, date, plan);
  const room = ctx.state.instance.cap - used;
  let best: Interval | null = null;
  for (const f of free) {
    const lo = Math.max(f.start, ceil5(after));
    const hi = Math.min(f.end, before);
    let length = Math.floor(Math.min(want, room, (hi - lo) / MINUTE) / 5) * 5;
    if (left - length > 0 && left - length < 15) length = left - 15;
    if (length < 15) continue;
    // Closest start to `near` that keeps the block inside the gap.
    const latest = hi - length * MINUTE;
    const start = Math.floor(Math.min(Math.max(near, lo), latest) / (5 * MINUTE)) * 5 * MINUTE;
    const s = start < lo ? lo : start;
    const candidate = { start: s, end: s + length * MINUTE };
    if (!best || Math.abs(candidate.start - near) < Math.abs(best.start - near)) best = candidate;
  }
  return best;
}

/** Days to search, closest to the anchor day first (or a fixed window, for the ablation). */
function neighbourhood(ctx: Ctx, anchor: number, until: number): string[] {
  const tz = ctx.state.instance.tz;
  const a = localDate(Math.max(anchor, ctx.state.now), tz);
  const days = ctx.dates.filter((d) => ctx.bounds.get(d)!.start < until);
  const index = (d: string) => Math.abs(Date.parse(d) - Date.parse(a)) / DAY;
  const ordered = [...days].sort((x, y) => index(x) - index(y) || x.localeCompare(y));
  return ctx.opts.widening ? ordered : ordered.filter((d) => index(d) <= FIXED_WINDOW_DAYS);
}

interface Move {
  plan: Block[];
  cost: number;
  placed: number; // minutes of the target work booked
}

function place(ctx: Ctx, plan: Block[], task: TaskSpec, want: number, left: number, anchor: number): Move | null {
  const after = Math.max(ctx.state.now, task.releaseAt);
  for (const date of neighbourhood(ctx, anchor, task.dueAt)) {
    const spot = spotOn(ctx, date, plan, want, after, task.dueAt, Math.max(anchor, after), left);
    if (!spot) continue;
    const block: Block = { id: `r${++ctx.counter}`, ...spot, taskId: task.id, subject: task.subject, fixed: false };
    return { plan: [...plan, block], cost: weight(ctx, spot.start), placed: (spot.end - spot.start) / MINUTE };
  }
  return null;
}

/**
 * Re-places a bumped block, as close to where it was as possible. Subject
 * time searches the week around it and may be dropped; deadline work searches
 * every day up to its due time and, failing that, may bump something due
 * later still (the chain), but is never dropped.
 */
function rehome(ctx: Ctx, plan: Block[], bumped: Block, depth: number): { plan: Block[]; cost: number } | null {
  const original = ctx.original.get(bumped.id);
  const before = positionCost(ctx, bumped, original);
  const tasks = new Map(ctx.state.tasks.map((t) => [t.id, t]));
  const task = bumped.taskId ? tasks.get(bumped.taskId)! : null;
  const due = task ? task.dueAt : ctx.state.instance.end;
  const length = (bumped.end - bumped.start) / MINUTE;
  const target = original?.start ?? bumped.start;
  const days = neighbourhood(ctx, target, due);
  for (const date of task ? days : days.slice(0, 7)) {
    const spot = spotOn(ctx, date, plan, length, ctx.state.now, due, target);
    if (!spot || (spot.end - spot.start) / MINUTE < length) continue;
    const moved: Block = { ...bumped, ...spot };
    return { plan: [...plan, moved], cost: positionCost(ctx, moved, original) - before };
  }
  if (!task) return { plan, cost: positionCost(ctx, null, original) - before };
  if (depth <= 0) return null;
  // Deadline work with nowhere to go: it bumps something due later still.
  const chained = eject(ctx, plan, task, length, length, target, depth - 1, bumped);
  if (!chained || chained.placed < length) return null;
  return { plan: chained.plan, cost: chained.cost - weight(ctx, target) + positionCost(ctx, null, original) - before };
}

/**
 * Bumps one less urgent block to make room for `task`, then re-places the
 * bumped block (which may bump another, up to CHAIN_DEPTH). `as` reuses a
 * bumped block's identity when the chain moves it rather than adding new work.
 */
function eject(
  ctx: Ctx, plan: Block[], task: TaskSpec, want: number, left: number, anchor: number, depth: number, as?: Block,
): Move | null {
  const tasks = new Map(ctx.state.tasks.map((t) => [t.id, t]));
  const days = new Set(neighbourhood(ctx, anchor, task.dueAt));
  const tz = ctx.state.instance.tz;
  const candidates = plan
    .filter((b) => b.taskId !== task.id && b.end <= task.dueAt && days.has(localDate(b.start, tz)))
    .filter((b) => !b.taskId || tasks.get(b.taskId)!.dueAt > task.dueAt)
    .sort((x, y) => weight(ctx, x.start) - weight(ctx, y.start))
    .slice(0, depth === CHAIN_DEPTH ? MAX_EJECT_CANDIDATES : 20);
  let best: Move | null = null;
  const after = Math.max(ctx.state.now, task.releaseAt);
  for (const x of candidates) {
    const without = plan.filter((b) => b.id !== x.id);
    const spot = spotOn(ctx, localDate(x.start, tz), without, want, after, task.dueAt, x.start, left);
    if (!spot) continue;
    const block: Block = as
      ? { ...as, ...spot }
      : { id: `r${++ctx.counter}`, ...spot, taskId: task.id, subject: task.subject, fixed: false };
    const home = rehome(ctx, [...without, block], x, depth);
    if (!home) continue;
    const cost = weight(ctx, spot.start) + home.cost;
    if (!best || cost < best.cost) best = { plan: home.plan, cost, placed: (spot.end - spot.start) / MINUTE };
  }
  return best;
}

export function stabilityRepair(state: RepairState, options: Partial<RepairOptions> = {}): Block[] {
  const opts = { ...DEFAULTS, ...options };
  const ctx = makeCtx(state, opts);
  const { instance } = state;
  let plan = stillValid(state);
  const kept = new Set(plan.map((b) => b.id));
  const lost = state.current.filter((b) => !kept.has(b.id));

  // Deadline work, most urgent first. Lost work goes back near where it was.
  const need = outstanding(state, plan);
  const order = state.tasks.filter((t) => need.has(t.id)).sort((a, b) => a.dueAt - b.dueAt || b.priority - a.priority);
  for (const task of order) {
    let left = need.get(task.id)!;
    const anchors = lost.filter((b) => b.taskId === task.id).map((b) => b.start);
    while (left >= 15) {
      const anchor = anchors.shift() ?? state.now;
      const want = left - instance.session < 15 ? left : Math.min(left, instance.session);
      let move = place(ctx, plan, task, want, left, anchor);
      if (!move && opts.ejection) move = eject(ctx, plan, task, want, left, anchor, CHAIN_DEPTH);
      if (!move || ctx.spent + move.cost > opts.budget) break;
      plan = move.plan;
      ctx.spent += move.cost;
      left -= move.placed;
    }
  }

  // Subject time the disruption knocked out: back into a free gap nearby if there is one.
  for (const b of lost.filter((x) => !x.taskId)) {
    const length = (b.end - b.start) / MINUTE;
    for (const date of neighbourhood(ctx, b.start, instance.end).slice(0, 3)) {
      const spot = spotOn(ctx, date, plan, length, state.now, instance.end, b.start);
      if (!spot || (spot.end - spot.start) / MINUTE < Math.min(length, 25)) continue;
      const moved: Block = { ...b, ...spot };
      const cost = positionCost(ctx, moved, b) - positionCost(ctx, null, b);
      if (ctx.spent + Math.max(0, cost) > opts.budget) break;
      plan = [...plan, moved];
      ctx.spent += Math.max(0, cost);
      break;
    }
  }
  return plan;
}

export function stabilityRepairMethod(code: string, options: Partial<RepairOptions> = {}): RepairMethod {
  const label = Object.entries(options).map(([k, v]) => `${k}=${v}`).join(", ");
  return {
    code,
    name: `Stability-budgeted repair${label ? ` (${label})` : ""}`,
    repair: (state) => stabilityRepair(state, options),
  };
}

// ---------------------------------------------------------------------------

export interface Certificate {
  /** Least extra study time any plan would need to cover every deadline. 0 = feasible. */
  shortMinutes: number;
  /** The window that is short: from now until this deadline. */
  windowEnd: number | null;
  /** Tasks due inside that window. */
  tasks: string[];
}

/**
 * For each deadline, the work that must be done by then against the study
 * time that exists before then (free time after sleep, commitments and study
 * already done, limited by each day's cap). The worst gap is a lower bound on
 * the extra time any valid plan needs.
 */
export function certificate(state: RepairState): Certificate {
  const { instance, now } = state;
  const ctx = makeCtx(state, DEFAULTS);
  const done = new Map<string, number>();
  for (const b of ctx.fixed) if (b.taskId) done.set(b.taskId, (done.get(b.taskId) ?? 0) + (b.end - b.start) / MINUTE);
  const live = state.tasks
    .filter((t) => t.dueAt > now)
    .map((t) => ({ t, left: Math.max(0, t.minutes - (done.get(t.id) ?? 0)) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => a.t.dueAt - b.t.dueAt);

  const supplyBefore = (until: number) => {
    let total = 0;
    for (const d of ctx.dates) {
      const { start } = ctx.bounds.get(d)!;
      if (start >= until) break;
      const { free, used } = dayView(ctx, d, []);
      const minutes = free.reduce((s, f) => s + Math.max(0, Math.min(f.end, until) - f.start) / MINUTE, 0);
      total += Math.max(0, Math.min(instance.cap - used, minutes));
    }
    return total;
  };

  let worst: Certificate = { shortMinutes: 0, windowEnd: null, tasks: [] };
  let demand = 0;
  for (let i = 0; i < live.length; i++) {
    demand += live[i].left;
    if (i + 1 < live.length && live[i + 1].t.dueAt === live[i].t.dueAt) continue;
    const short = demand - supplyBefore(live[i].t.dueAt);
    if (short > worst.shortMinutes) {
      worst = { shortMinutes: Math.round(short), windowEnd: live[i].t.dueAt, tasks: live.slice(0, i + 1).map((x) => x.t.id) };
    }
  }
  return worst;
}
