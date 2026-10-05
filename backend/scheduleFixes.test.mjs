// node --test scheduleFixes.test.mjs
// Regression tests for the scheduler defects found by the AUSSEF test harness
// (backend/research/AUSSEF-LOG.md, 4 and 5 October 2026).
import test from "node:test";
import assert from "node:assert/strict";
import "./research/hooks.mjs";

const { atLocalMinutes, startOfLocalDay } = await import("./src/lib/time.ts");
const { groundwork, planStudy } = await import("./src/lib/scheduler.ts");
const { localInstant } = await import("./src/lib/plan-changes.ts");
const { buildScenario } = await import("./research/src/scenario.ts");
const { validate } = await import("./research/src/validator.ts");

const MINUTE = 60_000;
const local = (ms, tz) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: tz, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(ms);

function profile(tz, extra = {}) {
  return {
    userId: "u", timezone: tz, bedtime: "22:30", wakeTime: "07:00", maxDailyStudyMinutes: 180,
    preferredSessionMinutes: 50, breakMinutes: 10, grade: "Year 12", state: null, minimumSleepMinutes: 480, ...extra,
  };
}
function inputs(tz, extra = {}) {
  return {
    profile: profile(tz, extra.profile), existing: extra.existing ?? [], commitments: extra.commitments ?? [],
    tasks: extra.tasks ?? [], subjects: [], earlierThisWeek: [], sessions: [], monthPlanRaw: undefined, layoutRow: undefined,
  };
}

test("defect 1: clock times are right on the day the clocks change", () => {
  const tz = "Australia/Sydney";
  for (const date of ["2026-10-04", "2027-04-04"]) {
    const day = startOfLocalDay(Date.parse(`${date}T02:00:00Z`), tz);
    assert.equal(local(atLocalMinutes(day, 16 * 60, tz), tz), `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(2, 4)}, 16:00`);
  }
  // A time inside the spring-forward gap moves just past it.
  const change = startOfLocalDay(Date.parse("2026-10-04T02:00:00Z"), tz);
  assert.equal(local(atLocalMinutes(change, 150, tz), tz), "04/10/26, 03:30");
});

test("defect 1: a commitment on a clock-change day blocks the right hour", () => {
  const tz = "Australia/Sydney";
  const from = startOfLocalDay(Date.parse("2026-10-03T12:00:00Z"), tz);
  const g = groundwork("u", inputs(tz, {
    commitments: [{ id: "c", title: "Sport", category: "sport", recurrence: "weekly", weekday: 0, startDate: null, startTime: "16:00", endTime: "18:00" }],
  }), from, from + 2 * 86_400_000, from);
  const sport = g.fixed.find((e) => e.kind === "commitment");
  assert.equal(local(sport.startAt, tz), "04/10/26, 16:00");
});

test("defect 6: one-off commitments land on their own date west of Greenwich", () => {
  for (const tz of ["America/Los_Angeles", "America/New_York", "Australia/Sydney", "Europe/London"]) {
    const from = startOfLocalDay(Date.parse("2026-11-17T12:00:00Z"), tz);
    const g = groundwork("u", inputs(tz, {
      commitments: [{ id: "c", title: "Busy", category: "other", recurrence: "none", weekday: null, startDate: "2026-11-19", startTime: "16:00", endTime: "18:00" }],
    }), from, from + 5 * 86_400_000, from);
    const busy = g.fixed.find((e) => e.kind === "commitment");
    assert.equal(local(busy.startAt, tz), "19/11/26, 16:00", tz);
  }
  assert.equal(local(localInstant("2026-10-04", 16 * 60, "Australia/Sydney"), "Australia/Sydney"), "04/10/26, 16:00");
});

test("defect 3: study never cuts into the minimum sleep", () => {
  const tz = "Australia/Brisbane";
  const from = startOfLocalDay(Date.parse("2026-11-02T00:00:00Z"), tz);
  const g = groundwork("u", inputs(tz, { profile: { bedtime: "00:30", wakeTime: "06:00", minimumSleepMinutes: 480 } }), from, from + 2 * 86_400_000, from);
  const night = g.fixed.filter((e) => e.kind === "sleep").map((e) => (e.endAt - e.startAt) / MINUTE);
  assert.ok(night.every((m) => m >= 480), `sleep blocks ${night}`);
});

test("defect 5: a new block keeps a break after the block under way", () => {
  const tz = "Australia/Brisbane";
  const now = Date.parse("2026-11-03T06:20:00Z"); // 4:20pm Brisbane
  const from = startOfLocalDay(now, tz);
  const underway = {
    id: "e1", userId: "u", taskId: null, commitmentId: null, title: "Maths study", subject: "Maths", category: "study",
    kind: "subject", startAt: now - 20 * MINUTE, endAt: now + 30 * MINUTE, status: "planned", outcome: "planned",
    source: "auto", editable: true, pinned: false, movedFrom: null,
  };
  const task = { id: "t1", userId: "u", title: "Essay", subject: "English", taskType: "assignment", dueAt: now + 86_400_000, estimatedMinutes: 120, completedMinutes: 0, priority: 2, status: "pending" };
  const data = inputs(tz, { existing: [underway], tasks: [task] });
  const g = groundwork("u", data, from, from + 2 * 86_400_000, now);
  const study = planStudy("u", data, g).planned.filter((r) => r.category === "study").sort((a, b) => a.startAt - b.startAt);
  const first = study.find((r) => r.startAt >= underway.endAt);
  assert.ok(first.startAt - underway.endAt >= 10 * MINUTE, `gap ${(first.startAt - underway.endAt) / MINUTE} min`);
});

test("defects 4 and 6, end to end: the harness scenarios that failed now pass", () => {
  // Seeds whose starting plans booked deadline work after it was due (9, 18, 38),
  // plus Los Angeles and clock-change scenarios that broke commitments.
  for (const seed of [1, 9, 18, 38, 43, 64, 67, 68, 104, 116]) {
    const s = buildScenario(seed);
    const v = validate(s.instance, s.instance.commitments, s.instance.tasks, [], s.startPlan, s.instance.start, null);
    assert.equal(v.late + v.commitment + v.sleep, 0, `seed ${seed}: ${v.notes.join("; ")}`);
  }
});
