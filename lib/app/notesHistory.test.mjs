import test from "node:test";
import assert from "node:assert/strict";
import { parseDayLine, parseDayPaste, parseNotesHistory } from "./dayLine.ts";
import { headlineText, isDayHeading, sectionText } from "../../shared/dayHeading.ts";

const SUBJECTS = ["Economics", "Literature"];
const at = (h, m = 0) => h * 60 + m;

// Two real days from Apple Notes, as they paste (Notes draws bullets as "* ").
const NOTES = `uesday 6th October:

* Up at 6:30 ✅
* Leave at 8 ish ✅
* School
   * Meeting with Ms Schneider 8:30?✅
* When home
   * Workout from 3:35 till 4:15, protein shake, get to work ✅
   * Sorted tabs and emails and compass etc till 5:15 ✅
* Priorities
   * Captain speech mastery ✅
   * Go over upcoming assessments for every subject



Sunday 11th October:

* Hyper focus and plan

* Wake at 6:30✅
* Brushed and Plan till 10:50 ✅
* Sleep at 11 ish✅`;

test("day headers split the paste into dated days, in the closest past year", () => {
  const days = parseNotesHistory(NOTES, "2026-10-18");
  assert.deepEqual(days.map((day) => day.day), ["2026-10-06", "2026-10-11"]);
  // A date after today belongs to last year.
  assert.equal(parseNotesHistory("Monday 28th December:\n* Plan", "2026-10-18")[0].day, "2025-12-28");
});

test("a pasted day keeps its times, ticks and sections", () => {
  const [tuesday] = parseNotesHistory(NOTES, "2026-10-18");
  const lines = parseDayPaste(tuesday.text, SUBJECTS);
  const byTitle = Object.fromEntries(lines.map((line) => [line.title, line]));

  assert.equal(byTitle["Up at"]?.start ?? byTitle["Up"]?.start, at(6, 30), "Up at 6:30 stays in the morning");
  assert.equal(byTitle["Leave"].start, at(8), "8 ish is 8am, and ish leaves the title");
  assert.equal(byTitle["Meeting with Ms Schneider"].start, at(8, 30), "8:30? is still placed");
  assert.equal(byTitle["Meeting with Ms Schneider"].done, true);
  assert.ok(byTitle["School:"], "School with lines under it is a section");
  assert.ok(byTitle["When home:"]);
  assert.ok(byTitle["Priorities:"]);

  const workout = lines.find((line) => line.title.startsWith("Workout"));
  assert.deepEqual([workout.start, workout.end], [at(15, 35), at(16, 15)]);
  const tabs = lines.find((line) => line.title.startsWith("Sorted tabs"));
  assert.deepEqual([tabs.start, tabs.end, tabs.done], [at(16, 15), at(17, 15), true], "till 5:15 starts where the workout ended");

  const open = lines.find((line) => line.title.startsWith("Go over upcoming"));
  assert.equal(open.done, false);
  assert.equal(open.start, null);
});

test("a first line on its own is the day's headline, and the evening reads forward", () => {
  const [, sunday] = parseNotesHistory(NOTES, "2026-10-18");
  const lines = parseDayPaste(sunday.text, SUBJECTS);
  assert.equal(lines[0].title, "!Hyper focus and plan");
  const brushed = lines.find((line) => line.title.startsWith("Brushed"));
  const sleep = lines.find((line) => line.title.startsWith("Sleep"));
  assert.equal(brushed.end, at(22, 50), "till 10:50 after a morning line is still the evening");
  assert.equal(sleep.start, at(23), "Sleep at 11 after 10:50pm is 11pm");
});

test("typed lines: till, from, ranges with ish, and headings", () => {
  assert.deepEqual(
    [parseDayLine("Sorted emails till 5:15", []).start, parseDayLine("Sorted emails till 5:15", []).end],
    [at(16, 45), at(17, 15)],
  );
  const leave = parseDayLine("Leave at 7:15-7:20 ish", []);
  assert.equal(leave.start, at(7, 15));
  assert.equal(leave.title, "Leave");
  assert.equal(parseDayLine("from 3:35 till 4:15 workout", []).end, at(16, 15));
  assert.equal(headlineText("!Hyper focus"), "Hyper focus");
  assert.equal(sectionText("When home:"), "When home");
  assert.equal(sectionText("Up at 6:"), null);
  assert.equal(isDayHeading("Call with Pari"), false);
});
