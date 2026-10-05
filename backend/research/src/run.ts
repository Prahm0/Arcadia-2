/**
 * Runs every method on every scenario in a seed range and saves the raw
 * results (PROTOCOL.md section 11).
 *
 *   node research/run.mjs --name pilot --from 1 --to 240
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arcadiaRebuild } from "./arcadia.ts";
import { coverageFirst, edfInsert, noRepair } from "./baselines.ts";
import { utilisationOf } from "./generate.ts";
import { measure } from "./metrics.ts";
import { certificate, coverageBound, stabilityRepairMethod } from "./repair.ts";
import { buildScenario, repairState } from "./scenario.ts";
import type { RepairMethod } from "./types.ts";
import { validate } from "./validator.ts";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<string[][]>((pairs, a, i, all) => (a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
);
const name = args.name ?? "run";
const from = Number(args.from ?? 1);
const to = Number(args.to ?? 20);
const allMethods: RepairMethod[] = [
  noRepair, edfInsert, arcadiaRebuild, coverageFirst,
  stabilityRepairMethod("M4"),
  // The frontier: the same repair at increasing disruption budgets.
  ...[0.5, 1, 2, 4, 8].map((budget) => stabilityRepairMethod(`M4-b${budget}`, { budget })),
  // Ablations (PROTOCOL.md section 6).
  stabilityRepairMethod("M4-noNear", { nearTermWeighting: false }),
  stabilityRepairMethod("M4-noEject", { ejection: false }),
  stabilityRepairMethod("M4-fixedWindow", { widening: false }),
  stabilityRepairMethod("M4-noEscalate", { escalation: false }),
];
// --methods M2,M4 runs a subset (e.g. re-testing Arcadia after a fix).
const only = args.methods ? new Set(String(args.methods).split(",")) : null;
const methods = only ? allMethods.filter((m) => only.has(m.code)) : allMethods;

const columns = [
  "seed", "method", "label", "severity", "severity_min", "tz", "start_date", "clock_change", "utilisation_target",
  "utilisation", "clustered", "cap", "tasks", "start_violations",
  "violations", "v_commitment", "v_sleep", "v_overlap", "v_break", "v_cap", "v_late", "v_release", "v_short", "v_past",
  "violation_min", "coverage", "unmet_weighted", "unmet", "fully_prepared", "unchanged", "moved", "removed", "added",
  "displacement", "day_changes", "cost", "subject_error", "starved", "runtime_ms", "cert_short", "cert_tasks", "coverage_bound",
  "first_violation",
];
const rows: string[] = [columns.join(",")];
const csv = (x: unknown) => (typeof x === "string" && /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : String(x));

const started = Date.now();
for (let seed = from; seed <= to; seed++) {
  const scenario = buildScenario(seed);
  const { instance } = scenario;
  const startCheck = validate(instance, instance.commitments, instance.tasks, [], scenario.startPlan, instance.start, null);
  const util = utilisationOf(instance);
  const cert = certificate(repairState(scenario));
  const bound = coverageBound(repairState(scenario));
  for (const method of methods) {
    const state = repairState(scenario);
    const t0 = performance.now();
    const blocks = method.repair(state).filter((b) => b.start < instance.end);
    const runtime = performance.now() - t0;
    const v = validate(instance, state.commitments, state.tasks, state.fixed, blocks, state.now, state.missedBlockId);
    const m = measure(state, blocks);
    const row = [
      seed, method.code, scenario.label, scenario.severity, scenario.severityMinutes, instance.tz, instance.startDate,
      instance.crossesClockChange, instance.utilisation, util.toFixed(3), instance.clustered, instance.cap, state.tasks.length,
      startCheck.total, v.total, v.commitment, v.sleep, v.studyOverlap, v.break, v.cap, v.late, v.release, v.short, v.past,
      v.minutes.toFixed(1), m.coverage.toFixed(4), m.unmetWeighted.toFixed(1), m.unmet.toFixed(1), m.fullyPrepared.toFixed(4),
      m.unchanged.toFixed(4), m.moved.toFixed(4), m.removed.toFixed(4), m.added, m.displacement.toFixed(1), m.dayChanges,
      m.cost.toFixed(3), m.subjectError.toFixed(4), m.starved.toFixed(4), runtime.toFixed(2), cert.shortMinutes,
      cert.tasks.length, bound.toFixed(4), v.notes[0] ?? "",
    ];
    rows.push(row.map(csv).join(","));
  }
  if (seed % 20 === 0) process.stderr.write(`seed ${seed}\n`);
}

const date = new Date().toISOString().slice(0, 10);
const dir = join(import.meta.dirname, "..", "results", `${date}-${name}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "results.csv"), rows.join("\n") + "\n");
const commit = execSync("git rev-parse HEAD").toString().trim();
const dirty = execSync("git status --porcelain").toString().trim().length > 0;
writeFileSync(
  join(dir, "config.json"),
  JSON.stringify(
    { name, seeds: [from, to], methods: methods.map((m) => m.code), commit, uncommittedChanges: dirty, node: process.version, date: new Date().toISOString(), seconds: (Date.now() - started) / 1000 },
    null,
    2,
  ) + "\n",
);
console.log(`wrote ${rows.length - 1} rows to ${dir}`);
