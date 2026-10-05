/**
 * Where do M4's extra changes come from? For each scenario, compares M4 with
 * M4 without escalation: if the plans differ, escalation fired.
 *
 *   FULL=1 node research/exact.mjs diagnose <from> <to> > diagnose.csv
 */
import { OPTIONS } from "./exact-export.ts";
import { measure } from "./metrics.ts";
import { stabilityRepairMethod } from "./repair.ts";
import { buildScenario, repairState } from "./scenario.ts";
import type { Block } from "./types.ts";
import { validate } from "./validator.ts";

const key = (bs: Block[]) => bs.map((b) => `${b.taskId}|${b.subject}|${b.start}|${b.end}`).sort().join(";");
const m4 = stabilityRepairMethod("M4");
const local = stabilityRepairMethod("M4-noEscalate", { escalation: false });
const rows = ["seed,utilisation,escalated,m4_coverage,m4_changed,local_coverage,local_changed,local_violations"];
const [from, to] = process.argv.slice(3).map(Number);
for (let seed = from; seed <= to; seed++) {
  const scenario = buildScenario(seed, OPTIONS);
  const end = scenario.instance.end;
  const [a, b] = [m4, local].map((m) => m.repair(repairState(scenario)).filter((x) => x.start < end));
  const state = repairState(scenario);
  const total = state.current.filter((x) => x.start < end).length;
  const changed = (bs: Block[]) => total - Math.round(measure(repairState(scenario), bs).unchanged * total);
  const v = validate(scenario.instance, state.commitments, state.tasks, state.fixed, b, state.now, state.missedBlockId);
  rows.push([seed, scenario.instance.utilisation, key(a) !== key(b) ? 1 : 0,
    measure(repairState(scenario), a).coverage.toFixed(5), changed(a),
    measure(repairState(scenario), b).coverage.toFixed(5), changed(b), v.total].join(","));
}
process.stdout.write(rows.join("\n") + "\n");
