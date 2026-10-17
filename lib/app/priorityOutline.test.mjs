import test from "node:test";
import assert from "node:assert/strict";
import { fromSaved, indent, outdent, parsePasted, pasteAt, toSaved } from "./priorityOutline.ts";

const EXAMPLE = `- Academics
  - Methods
    - Do a few of those methods questions
  - Economics
    - Do that Econ questions ppt
  - Literature
    - Grind literature and osc ppt
- AOO
  - Hyper focus prep
- Arcadia
  - Product
  - Marketing
- Misc
  - Improve handwriting`;

const SUBJECTS = ["Chemistry", "Mathematical Methods", "Economics", "Literature"];
let n = 0;
const id = () => `p${++n}`;

test("pasting the example bullet list imports the same tree", () => {
  assert.deepEqual(parsePasted(EXAMPLE), [
    { depth: 0, text: "Academics" },
    { depth: 1, text: "Methods" },
    { depth: 2, text: "Do a few of those methods questions" },
    { depth: 1, text: "Economics" },
    { depth: 2, text: "Do that Econ questions ppt" },
    { depth: 1, text: "Literature" },
    { depth: 2, text: "Grind literature and osc ppt" },
    { depth: 0, text: "AOO" },
    { depth: 1, text: "Hyper focus prep" },
    { depth: 0, text: "Arcadia" },
    { depth: 1, text: "Product" },
    { depth: 1, text: "Marketing" },
    { depth: 0, text: "Misc" },
    { depth: 1, text: "Improve handwriting" },
  ]);
});

test("tabs, bullets of any kind, numbers and blank lines all paste", () => {
  assert.deepEqual(parsePasted("• Area\n\t◦ Subject\n\t\t▪ Task\n\n1. Other"), [
    { depth: 0, text: "Area" },
    { depth: 1, text: "Subject" },
    { depth: 2, text: "Task" },
    { depth: 0, text: "Other" },
  ]);
});

test("saved items get parents in outline order and subjects from the heading they sit under", () => {
  const lines = pasteAt([{ id: "start", depth: 0, text: "", done: false, dueOn: null }], 0, parsePasted(EXAMPLE), id);
  const saved = toSaved(lines, SUBJECTS);
  const byText = Object.fromEntries(saved.map((item) => [item.text, item]));
  assert.equal(saved.length, 14);
  assert.equal(byText["Academics"].parentId, null);
  assert.equal(byText["Methods"].parentId, byText["Academics"].id);
  assert.equal(byText["Do a few of those methods questions"].parentId, byText["Methods"].id);
  assert.equal(byText["Methods"].subject, "Mathematical Methods");
  assert.equal(byText["Do a few of those methods questions"].subject, "Mathematical Methods");
  assert.equal(byText["Do that Econ questions ppt"].subject, "Economics");
  assert.equal(byText["Grind literature and osc ppt"].subject, "Literature");
  assert.equal(byText["Hyper focus prep"].subject, null);
  assert.equal(byText["Improve handwriting"].subject, null);
  // And back again.
  assert.deepEqual(fromSaved(saved).map((line) => [line.depth, line.text]), parsePasted(EXAMPLE).map((line) => [line.depth, line.text]));
});

test("pasting into an empty line replaces it; into a filled one, it goes below at that level", () => {
  const empty = pasteAt([{ id: "a", depth: 1, text: "", done: false, dueOn: null }], 0, parsePasted("- X\n  - Y"), id);
  assert.deepEqual(empty.map((line) => [line.depth, line.text]), [[1, "X"], [2, "Y"]]);
  const filled = pasteAt([{ id: "a", depth: 0, text: "Area", done: false, dueOn: null }], 0, parsePasted("- X\n  - Y"), id);
  assert.deepEqual(filled.map((line) => [line.depth, line.text]), [[0, "Area"], [0, "X"], [1, "Y"]]);
});

const outline = (pairs) => pairs.map(([depth, text], index) => ({ id: `l${index}`, depth, text, done: false, dueOn: null }));
const shape = (lines) => lines.map((line) => [line.depth, line.text]);

test("Tab indents a line with its children, and only under a line above", () => {
  const lines = outline([[0, "A"], [0, "B"], [1, "B1"], [0, "C"]]);
  assert.deepEqual(shape(indent(lines, 1)), [[0, "A"], [1, "B"], [2, "B1"], [0, "C"]]);
  assert.deepEqual(shape(indent(lines, 0)), shape(lines));
  assert.deepEqual(shape(indent(indent(lines, 1), 1)), [[0, "A"], [1, "B"], [2, "B1"], [0, "C"]]);
});

test("Shift-Tab outdents a line with its children; siblings below it become its children", () => {
  const lines = outline([[0, "A"], [1, "A1"], [2, "A1a"], [1, "A2"], [0, "B"]]);
  assert.deepEqual(shape(outdent(lines, 1)), [[0, "A"], [0, "A1"], [1, "A1a"], [1, "A2"], [0, "B"]]);
  assert.deepEqual(shape(outdent(lines, 0)), shape(lines));
});
