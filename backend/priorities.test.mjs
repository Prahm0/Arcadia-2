import test from "node:test";
import assert from "node:assert/strict";
import { openTasks, topBySubject, withPriorities } from "./src/lib/priority-picks.ts";

// The example outline, as the page saves it: outline order, parents first.
let position = 0;
const row = (id, parentId, text, subject = null, extra = {}) => ({ id, parentId, text, subject, position: position++, done: false, dueOn: null, doneAt: null, userId: "u", createdAt: 0, ...extra });
const rows = [
  row("a", null, "Academics"),
  row("m", "a", "Methods", "Mathematical Methods"),
  row("m1", "m", "Do a few of those methods questions", "Mathematical Methods"),
  row("e", "a", "Economics", "Economics"),
  row("e1", "e", "Do that Econ questions ppt", "Economics"),
  row("l", "a", "Literature", "Literature"),
  row("l1", "l", "Grind literature and osc ppt", "Literature"),
  row("aoo", null, "AOO"),
  row("aoo1", "aoo", "Hyper focus prep"),
  row("ar", null, "Arcadia"),
  row("ar1", "ar", "Product"),
  row("ar2", "ar", "Marketing"),
  row("x", null, "Misc"),
  row("x1", "x", "Improve handwriting"),
];

test("open tasks are the leaves, in outline order, headings left out", () => {
  assert.deepEqual(openTasks(rows).map((pick) => pick.text), [
    "Do a few of those methods questions",
    "Do that Econ questions ppt",
    "Grind literature and osc ppt",
    "Hyper focus prep",
    "Product",
    "Marketing",
    "Improve handwriting",
  ]);
});

test("anything with a due date comes first", () => {
  const dated = rows.map((r) => (r.id === "x1" ? { ...r, dueOn: "2026-10-20" } : r));
  assert.equal(openTasks(dated)[0].text, "Improve handwriting");
});

test("a finished task hands over to the next one, and a heading with no open children becomes a task", () => {
  const done = rows.map((r) => (r.id === "m1" ? { ...r, done: true } : r));
  assert.equal(topBySubject(done).has("Mathematical Methods"), false);
  assert.ok(openTasks(done).some((pick) => pick.text === "Methods"));
});

test("free study blocks show the top priority for their subject; deadline blocks don't", () => {
  const top = topBySubject(rows);
  assert.equal(top.get("Economics").text, "Do that Econ questions ppt");
  const events = [
    { id: "1", category: "study", kind: "subject", taskId: null, subject: "Economics" },
    { id: "2", category: "study", kind: "task", taskId: "t1", subject: "Economics" },
    { id: "3", category: "study", kind: "subject", taskId: null, subject: "Chemistry" },
  ];
  const shown = withPriorities(events, top);
  assert.deepEqual(shown[0].priority, { id: "e1", text: "Do that Econ questions ppt" });
  assert.equal(shown[1].priority, undefined);
  assert.equal(shown[2].priority, undefined);
});
