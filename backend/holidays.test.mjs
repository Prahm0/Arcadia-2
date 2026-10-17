// node --test holidays.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { upcomingHoliday, termJustStarted, holidayStartLabel } = await import("../lib/app/holidays.ts");

// QLD 2026: term 3 ends Fri 18 Sep, term 4 starts Tue 6 Oct.
const terms = [
  { year: 2026, term: 3, start: "2026-07-13", end: "2026-09-18" },
  { year: 2026, term: 4, start: "2026-10-06", end: "2026-12-11" },
];

test("the holidays are found from three days before until they start", () => {
  assert.equal(upcomingHoliday(terms, "2026-09-15"), null);
  assert.deepEqual(upcomingHoliday(terms, "2026-09-16"), { start: "2026-09-19", end: "2026-10-05" });
  assert.deepEqual(upcomingHoliday(terms, "2026-09-19"), { start: "2026-09-19", end: "2026-10-05" });
  assert.equal(upcomingHoliday(terms, "2026-09-20"), null);
  assert.equal(upcomingHoliday([], "2026-09-19"), null);
});

test("a term that has just started is found for its first three days", () => {
  assert.equal(termJustStarted(terms, "2026-10-06")?.term, 4);
  assert.equal(termJustStarted(terms, "2026-10-08")?.term, 4);
  assert.equal(termJustStarted(terms, "2026-10-09"), null);
});

test("the start is named by weekday, or today", () => {
  assert.equal(holidayStartLabel("2026-09-19", "2026-09-16"), "Saturday");
  assert.equal(holidayStartLabel("2026-09-19", "2026-09-19"), "today");
});
