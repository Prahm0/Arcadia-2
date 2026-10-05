/**
 * Exports a handful of real confirmatory scenarios for the visual demo page:
 * the week after the disruption, before and after each repair, in local time.
 *
 *   node research/demo-export.mjs 1003 1047 ...  > research/demo/scenarios.json
 */
import { arcadiaRebuild } from "./arcadia.ts";
import { coverageFirst } from "./baselines.ts";
import { commitmentIntervals, horizonDates, sleepIntervals } from "./calendar.ts";
import { addDays, localDate, localMinutes, parseClock } from "./localtime.ts";
import { measure } from "./metrics.ts";
import { certificate, stabilityRepairMethod } from "./repair.ts";
import { buildScenario, repairState } from "./scenario.ts";
import type { Block, RepairMethod } from "./types.ts";
import { DAY, MINUTE } from "./types.ts";
import { validate } from "./validator.ts";

const SHOW_DAYS = 7;
const methods: RepairMethod[] = [arcadiaRebuild, coverageFirst, stabilityRepairMethod("M4")];
const seeds = process.argv.slice(2).map(Number).filter(Boolean);

const DISRUPTION_TEXT: Record<string, string> = {
  D1: "Missed a study block",
  D2: "Something came up",
  D3: "Lost the rest of the day",
  D4: "A regular commitment moved",
  D5: "New task set",
};

function identity(b: Block) {
  return b.taskId ? `t:${b.taskId}` : `s:${(b.subject ?? "").toLowerCase()}`;
}

/** Labels each repaired block unchanged / moved / new, and lists the originals it removed. */
function classify(original: Block[], repaired: Block[]) {
  const pool = new Map<string, Block[]>();
  for (const r of repaired) pool.set(identity(r), [...(pool.get(identity(r)) ?? []), r]);
  const status = new Map<Block, { kind: string; from?: Block }>();
  const removed: Block[] = [];
  const leftover: Block[] = [];
  for (const o of original) {
    const list = pool.get(identity(o)) ?? [];
    const i = list.findIndex((r) => r.start === o.start && r.end === o.end);
    if (i >= 0) status.set(list.splice(i, 1)[0], { kind: "same" });
    else leftover.push(o);
  }
  for (const o of leftover) {
    const list = pool.get(identity(o)) ?? [];
    if (!list.length) {
      removed.push(o);
      continue;
    }
    list.sort((x, y) => Math.abs(x.start - o.start) - Math.abs(y.start - o.start));
    status.set(list.shift()!, { kind: "moved", from: o });
  }
  for (const list of pool.values()) for (const r of list) status.set(r, { kind: "new" });
  return { status, removed };
}

const out = [];
for (const seed of seeds) {
  const scenario = buildScenario(seed);
  const { instance } = scenario;
  const tz = instance.tz;
  const firstDate = localDate(scenario.at, tz);
  const dates = Array.from({ length: SHOW_DAYS }, (_, i) => addDays(firstDate, i));
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const tasks = new Map(instance.tasks.map((t) => [t.id, t]));

  const place = (start: number, end: number) => {
    const d = localDate(start, tz);
    if (!dateIndex.has(d)) return null;
    const s = localMinutes(start, tz);
    const e = localDate(end - 1, tz) === d ? localMinutes(end, tz) || 1440 : 1440;
    return { day: dateIndex.get(d)!, start: s, end: Math.max(s + 5, e) };
  };
  const label = (b: Block, all = scenario.instance.tasks) => {
    const task = b.taskId ? (all.find((t) => t.id === b.taskId) ?? null) : null;
    return { subject: b.subject ?? "", task: task ? task.title : null, due: task ? localDate(task.dueAt, tz) : null };
  };

  const state = repairState(scenario);
  const allTasks = state.tasks;
  const view = (blocks: Block[], status?: Map<Block, { kind: string; from?: Block }>) =>
    blocks
      .map((b) => {
        const at = place(b.start, b.end);
        if (!at) return null;
        const st = status?.get(b);
        const from = st?.from ? place(st.from.start, st.from.end) : null;
        return { ...at, ...label(b, allTasks), kind: st?.kind ?? "same", from };
      })
      .filter(Boolean);

  // Busy time after the disruption, and what the disruption added.
  const hd = horizonDates(instance);
  const busy = commitmentIntervals(state.commitments, hd, tz);
  const before = commitmentIntervals(instance.commitments, hd, tz);
  const commitments = state.commitments.flatMap((c) =>
    commitmentIntervals([c], hd, tz)
      .map((i) => {
        const at = place(i.start, i.end);
        if (!at) return null;
        const fresh = !before.some((b) => b.start === i.start && b.end === i.end);
        return { ...at, title: c.title, fresh };
      })
      .filter(Boolean),
  );
  void busy;
  const sleep = sleepIntervals(instance, hd).flatMap((i) => {
    // Split a night across midnight into its two days.
    const parts = [];
    let s = i.start;
    while (s < i.end) {
      const d = localDate(s, tz);
      const dayEnd = s + (1440 - localMinutes(s, tz)) * MINUTE;
      const e = Math.min(i.end, dayEnd);
      if (dateIndex.has(d)) parts.push({ day: dateIndex.get(d)!, start: localMinutes(s, tz), end: localDate(e - 1, tz) === d ? localMinutes(e, tz) || 1440 : 1440 });
      s = e;
    }
    return parts;
  });

  const original = state.current.filter((b) => b.start < instance.end);
  const fixed = state.fixed.filter((b) => b.end > scenario.at - DAY);
  const missed = scenario.disruptions.find((d) => d.missedBlockId)?.missedBlockId;

  const plans: Record<string, unknown> = {
    before: {
      blocks: view(original),
      metrics: null,
    },
  };
  for (const m of methods) {
    const repaired = m.repair(repairState(scenario)).filter((b) => b.start < instance.end);
    const { status, removed } = classify(original, repaired);
    const v = validate(instance, state.commitments, state.tasks, state.fixed, repaired, state.now, state.missedBlockId);
    const metrics = measure(state, repaired);
    plans[m.code] = {
      blocks: view(repaired, status),
      removed: removed.map((b) => place(b.start, b.end) && { ...place(b.start, b.end)!, ...label(b, allTasks) }).filter(Boolean),
      metrics: {
        coverage: metrics.coverage,
        unchanged: metrics.unchanged,
        changed: original.length - Math.round(metrics.unchanged * original.length),
        total: original.length,
        violations: v.total,
        violation: v.notes[0] ?? null,
      },
    };
  }

  const cert = certificate(state);
  const disruption = scenario.disruptions.map((d) => {
    if (d.type === "D1") {
      const m = scenario.startPlan.find((b) => b.id === d.missedBlockId);
      return { type: d.type, text: DISRUPTION_TEXT.D1, detail: m ? `${m.subject} block missed` : "" };
    }
    if (d.type === "D5") return { type: d.type, text: DISRUPTION_TEXT.D5, detail: `${d.task!.subject}: ${d.task!.minutes} min due ${localDate(d.task!.dueAt, tz)}` };
    if (d.commitment) return { type: d.type, text: DISRUPTION_TEXT[d.type], detail: `${d.commitment.title} ${d.commitment.date ?? ""} ${d.commitment.start}-${d.commitment.end}`.replace(/\s+/g, " ") };
    return { type: d.type, text: DISRUPTION_TEXT[d.type], detail: "" };
  });

  out.push({
    seed,
    tz,
    utilisation: instance.utilisation,
    cap: instance.cap,
    bedtime: instance.bedtime,
    wake: instance.wake,
    subjects: instance.subjects.map((s) => s.name),
    dates,
    now: { day: 0, minute: localMinutes(scenario.at, tz) },
    label: scenario.label,
    disruption,
    commitments,
    sleep,
    done: view(fixed.filter((b) => b.id !== missed)),
    missed: missed ? view(fixed.filter((b) => b.id === missed)) : [],
    tasks: allTasks.filter((t) => t.dueAt > scenario.at).map((t) => ({ title: t.title, subject: t.subject, minutes: t.minutes, due: localDate(t.dueAt, tz), dueMinute: localMinutes(t.dueAt, tz) })),
    certificate: cert.shortMinutes > 0 ? { short: cert.shortMinutes, until: cert.windowEnd ? `${localDate(cert.windowEnd, tz)} ${String(Math.floor(localMinutes(cert.windowEnd, tz) / 60)).padStart(2, "0")}:${String(localMinutes(cert.windowEnd, tz) % 60).padStart(2, "0")}` : null, tasks: cert.tasks.length } : null,
    plans,
  });
  void parseClock;
  void tasks;
}
process.stdout.write(JSON.stringify(out));
