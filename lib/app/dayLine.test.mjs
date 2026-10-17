import test from "node:test";
import assert from "node:assert/strict";
import { noteLine, parseDayLine } from "./dayLine.ts";

const SUBJECTS = ["Chemistry", "Mathematical Methods", "Economics", "Literature"];
const at = (h, m = 0) => h * 60 + m;
const parse = (text) => parseDayLine(text, SUBJECTS);

test("Wake at 7:30 is 7:30am", () => {
  assert.deepEqual(parse("Wake at 7:30"), { title: "Wake", subject: null, start: at(7, 30), end: null, evening: false });
});

test("SLC 10:50 is 10:50am", () => {
  assert.deepEqual(parse("SLC 10:50"), { title: "SLC", subject: null, start: at(10, 50), end: null, evening: false });
});

test("Back to work at 12 is noon", () => {
  assert.deepEqual(parse("Back to work at 12"), { title: "Back to work", subject: null, start: at(12), end: null, evening: false });
});

test("Power nap at 2:15 till 2:45 is 2:15pm to 2:45pm", () => {
  assert.deepEqual(parse("Power nap at 2:15 till 2:45"), { title: "Power nap", subject: null, start: at(14, 15), end: at(14, 45), evening: false });
});

test("Call with Pari is an untimed to-do", () => {
  assert.deepEqual(parse("Call with Pari"), { title: "Call with Pari", subject: null, start: null, end: null, evening: false });
});

test("Practising interview rest of night is evening with no fixed time", () => {
  assert.deepEqual(parse("Practising interview rest of night"), { title: "Practising interview", subject: null, start: null, end: null, evening: true });
});

test("a bare hour from 1 to 6 is pm, 7 to 11 is am, and am/pm always wins", () => {
  assert.equal(parse("Gym at 6").start, at(18));
  assert.equal(parse("Gym at 1").start, at(13));
  assert.equal(parse("Gym at 7").start, at(7));
  assert.equal(parse("Gym at 11").start, at(11));
  assert.equal(parse("Gym at 6am").start, at(6));
  assert.equal(parse("Gym at 9pm").start, at(21));
  assert.equal(parse("Gym 19:30").start, at(19, 30));
  assert.equal(parse("Lunch at noon").start, at(12));
});

test("ranges and lengths", () => {
  assert.deepEqual([parse("Work 11 till 1").start, parse("Work 11 till 1").end], [at(11), at(13)]);
  assert.deepEqual([parse("Shift 3pm-5pm").start, parse("Shift 3pm-5pm").end], [at(15), at(17)]);
  assert.deepEqual([parse("Run at 4 for 45 min").start, parse("Run at 4 for 45 min").end], [at(16), at(16, 45)]);
  assert.equal(parse("Run at 4 for 45 min").title, "Run");
});

test("plain numbers are not times", () => {
  assert.deepEqual(parse("Do 3 questions"), { title: "Do 3 questions", subject: null, start: null, end: null, evening: false });
});

test("subjects come from the quick add parser", () => {
  assert.equal(parse("Do a few of those methods questions").subject, "Mathematical Methods");
  assert.equal(parse("Do that Econ questions ppt").subject, "Economics");
  assert.equal(parse("Grind literature and osc ppt").subject, "Literature");
  assert.equal(parse("Chem 3:30").subject, "Chemistry");
  assert.equal(parse("Chem 3:30").start, at(15, 30));
});

test("tonight and this evening are evening too", () => {
  assert.equal(parse("Read tonight").evening, true);
  assert.equal(parse("Read tonight").title, "Read");
});

test("a line starting with a dash is a note for the line above", () => {
  assert.equal(noteLine("- ask about the internship"), "ask about the internship");
  assert.equal(noteLine("• bring notes"), "bring notes");
  assert.equal(noteLine("Call with Pari"), null);
  assert.equal(noteLine("-"), null);
});
