/**
 * Scores the exact optimiser's repairs with the same validator and measures
 * as every other method, next to M4 (and M2, M3) on the same small scenarios.
 *
 *   node research/exact.mjs eval solutions.json > exact-results.csv
 */
import { readFileSync } from "node:fs";
import { arcadiaRebuild } from "./arcadia.ts";
import { coverageFirst } from "./baselines.ts";
import { OPTIONS } from "./exact-export.ts";
import { measure } from "./metrics.ts";
import { stabilityRepairMethod } from "./repair.ts";
import { buildScenario, repairState } from "./scenario.ts";
import type { Block } from "./types.ts";
import { MINUTE } from "./types.ts";
import { validate } from "./validator.ts";

const SLOT = 5 * MINUTE;
const solutions = JSON.parse(readFileSync(process.argv[3], "utf8")) as Array<{
  seed: number; status: string; seconds: number; kept: string[];
  runs: Array<{ taskId: string; startSlot: number; endSlot: number }>;
}>;
const m4 = stabilityRepairMethod("M4");
const rows = ["seed,method,status,solve_s,violations,coverage,unchanged,changed,total,first_violation"];
const q = (x: unknown) => (typeof x === "string" && /[",]/.test(x) ? `"${x.replace(/"/g, '""')}"` : String(x));

for (const sol of solutions) {
  const scenario = buildScenario(sol.seed, OPTIONS);
  const plans: Array<[string, Block[]]> = [];
  for (const method of [arcadiaRebuild, coverageFirst, m4]) {
    plans.push([method.code, method.repair(repairState(scenario)).filter((b) => b.start < scenario.instance.end)]);
  }
  if (sol.status === "OPTIMAL" || sol.status === "FEASIBLE") {
    const state = repairState(scenario);
    const t0 = Math.ceil(state.now / SLOT) * SLOT;
    const tasks = new Map(state.tasks.map((t) => [t.id, t]));
    const kept = new Set(sol.kept);
    const opt: Block[] = [
      ...state.current.filter((b) => kept.has(b.id)),
      ...sol.runs.map((r, i) => ({
        id: `opt${i}`, start: t0 + r.startSlot * SLOT, end: t0 + r.endSlot * SLOT,
        taskId: r.taskId, subject: tasks.get(r.taskId)?.subject ?? null, fixed: false,
      })),
    ];
    plans.push(["OPT", opt]);
  }
  for (const [code, blocks] of plans) {
    const state = repairState(scenario);
    const v = validate(scenario.instance, state.commitments, state.tasks, state.fixed, blocks, state.now, state.missedBlockId);
    const m = measure(state, blocks);
    const total = state.current.filter((b) => b.start < scenario.instance.end).length;
    rows.push([sol.seed, code, code === "OPT" ? sol.status : "", code === "OPT" ? sol.seconds : "", v.total,
      m.coverage.toFixed(5), m.unchanged.toFixed(5), total - Math.round(m.unchanged * total), total, v.notes[0] ?? ""].map(q).join(","));
  }
}
process.stdout.write(rows.join("\n") + "\n");
