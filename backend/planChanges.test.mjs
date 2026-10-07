// node --experimental-transform-types --test planChanges.test.mjs
// (scheduler.ts has syntax that plain type stripping can't run).
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

const { localInstant } = await import("./src/lib/plan-changes.ts");
const { bookedTaskTime, taskQueue } = await import("./src/lib/scheduler.ts");

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
