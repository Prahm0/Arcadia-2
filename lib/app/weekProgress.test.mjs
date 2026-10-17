import test from "node:test";
import assert from "node:assert/strict";
import { mondayOf, reviewLeads, weekProgress } from "./weekProgress.ts";

const block = (startAt, minutes, outcome = "planned", category = "study") => ({
  category, outcome, startAt, endAt: new Date(Date.parse(startAt) + minutes * 60000).toISOString(),
});

test("weeks start on Monday", () => {
  assert.equal(mondayOf("2026-10-17"), "2026-10-12");
  assert.equal(mondayOf("2026-10-12"), "2026-10-12");
  assert.equal(mondayOf("2026-10-18"), "2026-10-12");
});

test("counts this week's study blocks only, in the student's zone", () => {
  const events = [
    block("2026-10-12T06:00:00Z", 50, "completed"),
    block("2026-10-14T06:00:00Z", 45, "completed"),
    block("2026-10-16T06:00:00Z", 50),
    block("2026-10-16T08:00:00Z", 90, "completed", "sport"),
    block("2026-10-11T06:00:00Z", 50, "completed"),
    // Sunday 18th, 11pm in Melbourne is still this week there.
    block("2026-10-18T12:00:00Z", 30, "completed"),
  ];
  const week = weekProgress(events, "Australia/Melbourne", "2026-10-17");
  assert.deepEqual({ planned: week.planned, done: week.done, minutes: week.minutes }, { planned: 4, done: 3, minutes: 125 });
  assert.equal(week.ratio, 0.75);
});

test("an empty week has a zero ratio, not NaN", () => {
  assert.equal(weekProgress([], "UTC", "2026-10-17").ratio, 0);
});

test("the review leads on Sunday and Monday", () => {
  assert.equal(reviewLeads("2026-10-18"), true);
  assert.equal(reviewLeads("2026-10-19"), true);
  assert.equal(reviewLeads("2026-10-17"), false);
});
