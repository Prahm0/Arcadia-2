import test from "node:test";
import assert from "node:assert/strict";
import { parseDayPaste, parseLoggedLine } from "./dayLine.ts";

const SUBJECTS = ["Chemistry", "Economics"];
const at = (h, m = 0) => h * 60 + m;

test("did astronomy till 4:25 logs the half hour before as done", () => {
  const line = parseLoggedLine("did astronomy till 4:25", SUBJECTS);
  assert.deepEqual({ title: line.title, start: line.start, end: line.end, done: line.done }, { title: "astronomy", start: at(15, 55), end: at(16, 25), done: true });
});

test("workout 4:30 to 4:55 done logs that range as done", () => {
  const line = parseLoggedLine("workout 4:30 to 4:55 done", SUBJECTS);
  assert.deepEqual({ title: line.title, start: line.start, end: line.end, done: line.done }, { title: "workout", start: at(16, 30), end: at(16, 55), done: true });
});

test("a tick emoji marks a line done and comes off the title", () => {
  const line = parseLoggedLine("✅ Wake 7:30", SUBJECTS);
  assert.deepEqual({ title: line.title, start: line.start, done: line.done }, { title: "Wake", start: at(7, 30), done: true });
  assert.equal(parseLoggedLine("Chem revision ✅", SUBJECTS).done, true);
  assert.equal(parseLoggedLine("Chem revision ✅", SUBJECTS).title, "Chem revision");
});

test("ordinary lines are not done, and 'study till 5' isn't a log", () => {
  assert.equal(parseLoggedLine("SLC 10:50", SUBJECTS).done, false);
  assert.equal(parseLoggedLine("Call with Pari", SUBJECTS).done, false);
  assert.equal(parseLoggedLine("Get it done", SUBJECTS).done, false);
});

test("a pasted day becomes one line each, with notes and done lines", () => {
  const pasted = parseDayPaste([
    "Wake at 7:30 ✅",
    "SLC 10:50",
    "- bring the form",
    "- ask about camp",
    "",
    "• Econ questions",
    "Call with Pari",
    "did chemistry till 4:25",
  ].join("\n"), SUBJECTS);
  assert.deepEqual(pasted.map((line) => [line.title, line.start, line.done, line.notes]), [
    ["Wake", at(7, 30), true, []],
    ["SLC", at(10, 50), false, ["bring the form", "ask about camp"]],
    ["Econ questions", null, false, []],
    ["Call with Pari", null, false, []],
    ["chemistry", at(15, 55), true, []],
  ]);
  assert.equal(pasted[4].subject, "Chemistry");
});

test("a note with nothing above it is a line of its own", () => {
  assert.deepEqual(parseDayPaste("- buy milk\nGym at 6", SUBJECTS).map((line) => [line.title, line.notes.length]), [["buy milk", 0], ["Gym", 0]]);
});
