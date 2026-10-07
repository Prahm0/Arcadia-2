// node --test planChanges.test.mjs
// (Node strips the types; the Worker code avoids syntax that needs transforming.)
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The Worker's imports leave off ".ts" and import ../db as a folder, which
// the bundler allows and Node doesn't. Fill those in for these modules.
registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith(".") || specifier.endsWith(".ts")) return next(specifier, context);
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return next(candidate, context);
      } catch {
        // try the next shape
      }
    }
    return next(specifier, context);
  },
});

const { findTask, localInstant } = await import("./src/lib/plan-changes.ts");
const { bookedTaskTime, groundwork, skipDates, taskQueue } = await import("./src/lib/scheduler.ts");

const MINUTE = 60_000;

test("a local date and time land on the right instant in the student's zone", () => {
  assert.equal(new Date(localInstant("2026-10-08", 17 * 60, "Australia/Brisbane")).toISOString(), "2026-10-08T07:00:00.000Z");
  assert.equal(new Date(localInstant("2026-10-08", 17 * 60, "America/New_York")).toISOString(), "2026-10-08T21:00:00.000Z");
  // Sydney is on daylight time (UTC+11) after the first Sunday in October.
  assert.equal(new Date(localInstant("2026-10-08", 9 * 60, "Australia/Sydney")).toISOString(), "2026-10-07T22:00:00.000Z");
});

test("dates it can't read come back null", () => {
  assert.equal(localInstant("next thursday", 600, "Australia/Brisbane"), null);
  assert.equal(localInstant("2026-02-31", 600, "Australia/Brisbane"), null);
  assert.equal(localInstant(undefined, 600, "Australia/Brisbane"), null);
});

const now = Date.parse("2026-10-01T05:00:00Z");
const task = { id: "tsk_essay", estimatedMinutes: 120, completedMinutes: 0, dueAt: now + 5 * 86_400_000, priority: 2 };
const block = (extra) => ({
  id: "evt_1",
  taskId: "tsk_essay",
  category: "study",
  outcome: "planned",
  startAt: now + 60 * MINUTE,
  endAt: now + 110 * MINUTE,
  ...extra,
});

test("a moved deadline block counts as booked, so its time isn't booked again", () => {
  const booked = bookedTaskTime([block({ pinned: true })], now);
  assert.equal(booked.get("tsk_essay"), 50 * MINUTE);
  const [entry] = taskQueue([task], 50 * MINUTE, booked);
  assert.equal(entry.remaining, 70 * MINUTE);
});

test("done, skipped and past blocks don't count as booked", () => {
  const booked = bookedTaskTime(
    [
      block({ outcome: "completed" }),
      block({ outcome: "missed" }),
      block({ startAt: now - 120 * MINUTE, endAt: now - 70 * MINUTE }),
      block({ taskId: null }),
    ],
    now,
  );
  assert.equal(booked.size, 0);
});

test("a task fully covered by its booked blocks drops out of the queue", () => {
  const booked = new Map([["tsk_essay", 120 * MINUTE]]);
  assert.deepEqual(taskQueue([task], 50 * MINUTE, booked), []);
});

// Dev's "SMR until 9, then the Lab Report": Arcad named the tasks instead of
// passing their ids, and both blocks were dropped as "not one of your subjects".
const tasks = [
  { id: "tsk_smr", title: "Self Monitoring Report", subject: "PSYC2050" },
  { id: "tsk_lab", title: "Lab Report", subject: "BIOM2012" },
  { id: "tsk_video", title: "Video Assignment", subject: "PSYC3020" },
];

test("an add_block that names a task instead of giving its id finds the task", () => {
  assert.equal(findTask(tasks, { subject: "Self Monitoring Report (PSYC2050)" })?.id, "tsk_smr");
  assert.equal(findTask(tasks, { title: "lab report" })?.id, "tsk_lab");
  assert.equal(findTask(tasks, { taskId: "tsk_video" })?.id, "tsk_video");
});

test("a name that matches no task, or more than one, finds nothing", () => {
  assert.equal(findTask(tasks, { subject: "PSYC2050" }), undefined);
  assert.equal(findTask(tasks, { title: "Report" }), undefined);
  assert.equal(findTask(tasks, {}), undefined);
});

test("skip dates read back, and bad JSON reads as none", () => {
  assert.deepEqual(skipDates({ skipDates: '["2026-10-13"]' }), ["2026-10-13"]);
  assert.deepEqual(skipDates({ skipDates: "nope" }), []);
});

const tz = "Australia/Brisbane";
// Tuesday 13 Oct 2026, midnight in Brisbane (UTC+10).
const tuesday = Date.parse("2026-10-12T14:00:00Z");
const profile = {
  timezone: tz,
  bedtime: "22:00",
  wakeTime: "06:00",
  maxDailyStudyMinutes: 300,
  preferredSessionMinutes: 50,
  breakMinutes: 10,
};
const training = {
  id: "cmt_training",
  title: "Training",
  category: "sport",
  recurrence: "weekly",
  weekday: 2,
  startDate: null,
  startTime: "18:00",
  endTime: "20:00",
  bufferBefore: 0,
  bufferAfter: 0,
  skipDates: "[]",
};
const day = (commitment) =>
  groundwork("usr_test", { profile, existing: [], commitments: [commitment] }, tuesday, tuesday + 86_400_000, tuesday).days[0];
const at = (clock) => tuesday + (Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))) * MINUTE;

test("a gap around a commitment keeps that time free of study, and the commitment keeps its times", () => {
  const plain = day(training);
  assert.ok(plain.free.some((slot) => slot.end === at("18:00")));

  const gapped = groundwork(
    "usr_test",
    { profile, existing: [], commitments: [{ ...training, bufferBefore: 120, bufferAfter: 60 }] },
    tuesday,
    tuesday + 86_400_000,
    tuesday,
  );
  const [free] = gapped.days;
  assert.ok(free.free.some((slot) => slot.end === at("16:00")), "study stops two hours before training");
  assert.ok(free.free.every((slot) => slot.end <= at("16:00") || slot.start >= at("21:00")));
  const event = gapped.fixed.find((row) => row.commitmentId === "cmt_training");
  assert.equal(event.startAt, at("18:00"));
  assert.equal(event.endAt, at("20:00"));
});

test("a skipped day frees that day only", () => {
  const skipped = groundwork(
    "usr_test",
    { profile, existing: [], commitments: [{ ...training, skipDates: '["2026-10-13"]' }] },
    tuesday,
    tuesday + 14 * 86_400_000,
    tuesday,
  );
  const trainingDays = skipped.fixed
    .filter((row) => row.commitmentId === "cmt_training")
    .map((row) => new Date(row.startAt).toISOString().slice(0, 10));
  assert.deepEqual(trainingDays, ["2026-10-20"]);
});
