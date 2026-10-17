import test from "node:test";
import assert from "node:assert/strict";
import { localDayTime } from "./src/lib/time.ts";

test("a typed time lands on that wall-clock time in the student's zone", () => {
  // 2:15pm in Melbourne on 17 Oct 2026 (AEDT, +11) is 03:15 UTC.
  assert.equal(new Date(localDayTime("2026-10-17", 14 * 60 + 15, "Australia/Melbourne")).toISOString(), "2026-10-17T03:15:00.000Z");
  // 7:30am in Brisbane (+10, no daylight saving).
  assert.equal(new Date(localDayTime("2026-10-17", 7 * 60 + 30, "Australia/Brisbane")).toISOString(), "2026-10-16T21:30:00.000Z");
});

test("the day the clocks go forward still lands on the typed hour", () => {
  // Melbourne moved to daylight saving at 2am on 4 Oct 2026; 10:50am that day is +11.
  assert.equal(new Date(localDayTime("2026-10-04", 10 * 60 + 50, "Australia/Melbourne")).toISOString(), "2026-10-03T23:50:00.000Z");
  // 1am that day was still +10.
  assert.equal(new Date(localDayTime("2026-10-04", 60, "Australia/Melbourne")).toISOString(), "2026-10-03T15:00:00.000Z");
});
