// node --test quickAdd.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const { parseQuickAdd, matchSubject } = await import("../lib/app/quickAdd.ts");

// Saturday 17 October 2026.
const today = "2026-10-17";
const subjects = ["Chemistry", "Mathematical Methods", "Specialist Mathematics", "English", "Physics", "Biology"];
const read = (text) => parseQuickAdd(text, subjects, today);

test("a typical deadline: subject, type, weekday and length", () => {
  assert.deepEqual(read("chem SAC next thursday, about 3 hours"), {
    title: "Chem SAC",
    subject: "Chemistry",
    taskType: "exam",
    dueDate: "2026-10-22",
    dueTime: null,
    minutes: 180,
  });
});

test("dates in the forms students write", () => {
  assert.equal(read("english essay due 21 oct").dueDate, "2026-10-21");
  assert.equal(read("english essay due oct 21st").dueDate, "2026-10-21");
  assert.equal(read("english essay 3/11").dueDate, "2026-11-03");
  assert.equal(read("bio homework tomorrow").dueDate, "2026-10-18");
  assert.equal(read("bio homework tonight").dueDate, today);
  assert.equal(read("physics report in 2 weeks").dueDate, "2026-10-31");
  // Today is Saturday, so "saturday" is a week away, not today.
  assert.equal(read("methods test saturday").dueDate, "2026-10-24");
  // A date that has passed this year rolls to next year.
  assert.equal(read("mock exam 2 feb").dueDate, "2027-02-02");
});

test("times and lengths", () => {
  const essay = read("english essay friday at 9am 90 min");
  assert.equal(essay.dueTime, "09:00");
  assert.equal(essay.minutes, 90);
  assert.equal(essay.title, "English essay");
  assert.equal(read("chem worksheet 1.5h").minutes, 90);
  assert.equal(read("chem worksheet half an hour").minutes, 30);
});

test("types from the words used", () => {
  assert.equal(read("bio quiz").taskType, "exam");
  assert.equal(read("methods IA2").taskType, "assignment");
  assert.equal(read("physics depth study").taskType, "assignment");
  assert.equal(read("chem worksheet").taskType, "homework");
  assert.equal(read("revise for physics").taskType, "revision");
  assert.equal(read("something").taskType, null);
});

test("subjects from short forms, and nothing when it's ambiguous", () => {
  assert.equal(matchSubject("spesh test", subjects), "Specialist Mathematics");
  assert.equal(matchSubject("methods sac", subjects), "Mathematical Methods");
  assert.equal(matchSubject("eng essay", subjects), "English");
  // "maths" fits both maths subjects equally, so it's left for the student to pick.
  assert.equal(matchSubject("maths homework", subjects), null);
  assert.equal(matchSubject("chess club", subjects), null);
});

test("text it can't read stays in the title", () => {
  const plain = read("Finish the poster");
  assert.equal(plain.title, "Finish the poster");
  assert.equal(plain.dueDate, null);
  assert.equal(plain.minutes, null);
});
