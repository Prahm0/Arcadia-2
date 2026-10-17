import test from "node:test";
import assert from "node:assert/strict";
import { dueAtFor, guessMinutes, guessTaskType, planTaskSync, unlinkedTaskLines } from "./src/lib/priority-tasks.ts";

const zone = "Australia/Melbourne";
const options = () => { let n = 0; return { timezone: zone, now: 1_000, newTaskId: () => `tsk_new${++n}` }; };
const line = (id, text, dueOn = null, extra = {}) => ({ id, text, subject: null, dueOn, done: false, ...extra });

test("guesses the kind of work from the title", () => {
  assert.equal(guessTaskType("Chem test Thursday"), "exam");
  assert.equal(guessTaskType("Methods SAC"), "exam");
  assert.equal(guessTaskType("English essay draft"), "assignment");
  assert.equal(guessTaskType("Biology prac report"), "assignment");
  assert.equal(guessTaskType("Redox practice questions"), "study");
});

test("guesses prep time from the title and type", () => {
  assert.equal(guessMinutes("Methods SAC"), 180);
  assert.equal(guessMinutes("English essay"), 150);
  assert.equal(guessMinutes("Chem test"), 150);
  assert.equal(guessMinutes("History assignment"), 120);
  assert.equal(guessMinutes("Vocab quiz"), 60);
  assert.equal(guessMinutes("Read chapter 4"), 60);
});

test("exams are due at 9am, the rest at 11:59pm, in the student's zone", () => {
  assert.equal(new Date(dueAtFor("2026-10-22", "exam", zone)).toISOString(), "2026-10-21T22:00:00.000Z");
  assert.equal(new Date(dueAtFor("2026-10-22", "assignment", zone)).toISOString(), "2026-10-22T12:59:00.000Z");
});

test("a newly dated line becomes a task with a guessed estimate", () => {
  const sync = planTaskSync([line("a", "Chem test", "2026-10-22")], new Map(), new Map(), options());
  assert.equal(sync.creates.length, 1);
  assert.deepEqual({ ...sync.creates[0], dueAt: undefined }, { id: "tsk_new1", title: "Chem test", subject: null, taskType: "exam", dueAt: undefined, estimatedMinutes: 150, status: "pending", completedAt: null });
  assert.equal(sync.links.get("a"), "tsk_new1");
});

test("an undated line is never a task, and never needs an estimate", () => {
  const sync = planTaskSync([line("a", "Learn driving theory")], new Map(), new Map(), options());
  assert.deepEqual([sync.creates, sync.updates, sync.deletes], [[], [], []]);
});

const linked = (overrides = {}) => [
  new Map([["a", { taskId: "t1", text: "Chem test", subject: null, dueOn: "2026-10-22", done: false }]]),
  new Map([["t1", { id: "t1", title: "Chem test", subject: null, estimatedMinutes: 150, status: "pending", ...overrides }]]),
];

test("an unchanged dated line writes nothing and keeps its exact time", () => {
  const sync = planTaskSync([line("a", "Chem test", "2026-10-22")], ...linked(), options());
  assert.deepEqual([sync.creates, sync.updates, sync.deletes], [[], [], []]);
  assert.equal(sync.links.get("a"), "t1");
});

test("edits flow to the task: title, date, estimate and done", () => {
  const sync = planTaskSync([line("a", "Chem test, unit 3", "2026-10-23", { done: true, estimatedMinutes: 240 })], ...linked(), options());
  assert.equal(sync.updates.length, 1);
  const { patch } = sync.updates[0];
  assert.equal(patch.title, "Chem test, unit 3");
  assert.equal(new Date(patch.dueAt).toISOString(), "2026-10-22T22:00:00.000Z");
  assert.equal(patch.estimatedMinutes, 240);
  assert.equal(patch.status, "completed");
});

test("clearing the date or deleting the line removes the deadline", () => {
  assert.deepEqual(planTaskSync([line("a", "Chem test")], ...linked(), options()).deletes, ["t1"]);
  assert.deepEqual(planTaskSync([], ...linked(), options()).deletes, ["t1"]);
});

test("existing deadlines join the list in date order, dated in the student's zone", () => {
  const tasks = [
    { id: "t2", title: "Essay", subject: "English", dueAt: Date.parse("2026-10-21T12:59:00Z"), status: "pending" },
    { id: "t1", title: "Chem test", subject: null, dueAt: Date.parse("2026-10-21T22:00:00Z"), status: "pending" },
    { id: "t3", title: "Old", subject: null, dueAt: 0, status: "completed" },
    { id: "t4", title: "Linked", subject: null, dueAt: 0, status: "pending" },
  ];
  assert.deepEqual(unlinkedTaskLines(tasks, new Set(["t4"]), zone), [
    { id: "pri_t2", text: "Essay", subject: "English", dueOn: "2026-10-21", taskId: "t2" },
    { id: "pri_t1", text: "Chem test", subject: null, dueOn: "2026-10-22", taskId: "t1" },
  ]);
});
