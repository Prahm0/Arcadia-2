import test from "node:test";
import assert from "node:assert/strict";
import { parseTags, pointList, readWork, tagWork, TAGGING_PROMPT_VERSION } from "./src/lib/work-tagging.ts";

const points = [
  { id: "MM-2.5.1.1", unit: 2, topicTitle: "Further differentiation", subtopic: "Differentiation rules", text: "Use the chain rule…" },
  { id: "MM-2.5.1.2", unit: 2, topicTitle: "Further differentiation", subtopic: "Differentiation rules", text: "Use the product rule…" },
  { id: "MM-3.4.1.3", unit: 3, topicTitle: "Introduction to integration", subtopic: "Anti-differentiation", text: "Use ∫xⁿdx…" },
];
const known = new Set(points.map((p) => p.id));

/** A stand-in model: answers each step with the given reply, and records what it was asked. */
function fakeCall(replies) {
  const asked = [];
  const call = async (step, messages, schema, reply) => {
    asked.push({ step, messages, schema, reply });
    return replies[step] ?? null;
  };
  return { call, asked };
}

test("tags are kept to known points, one each, on the rubric's scale", () => {
  const tags = parseTags(
    [
      { id: "MM-2.5.1.1", questions: 3, quality: 75, evidence: "Q1-3 chain rule, slip in 2b" },
      { id: "MM-2.5.1.1", questions: 1, quality: 0, evidence: "duplicate" },
      { id: "MM-9.9.9.9", questions: 1, quality: 100, evidence: "made up" },
      { id: " MM-2.5.1.2 ", questions: 0, quality: 60, evidence: "x".repeat(400) },
      "junk",
    ],
    known,
  );
  assert.deepEqual(
    tags.map(({ pointId, quality, questions }) => ({ pointId, quality, questions })),
    [
      { pointId: "MM-2.5.1.1", quality: 75, questions: 3 },
      // 60 snaps to 50; questions floor at 1.
      { pointId: "MM-2.5.1.2", quality: 50, questions: 1 },
    ],
  );
  assert.equal(tags[1].evidence.length, 200);
  assert.deepEqual(parseTags("nope", known), []);
});

test("no more than six tags per piece of work", () => {
  const many = Array.from({ length: 10 }, (_, i) => `P${i}`);
  const tags = parseTags(many.map((id) => ({ id, questions: 1, quality: 50, evidence: "" })), new Set(many));
  assert.equal(tags.length, 6);
});

test("reading normalises the model's reply", async () => {
  const { call, asked } = fakeCall({ read: { readable: true, pages: 0, kind: "weird", transcript: "Q1 d/dx x^2 = 2x" } });
  const reading = await readWork(call, { bytes: new TextEncoder().encode("hi"), contentType: "text/plain", filename: "a.txt" }, "Methods");
  assert.deepEqual(reading, { readable: true, pages: 1, kind: "attempt", transcript: "Q1 d/dx x^2 = 2x" });
  assert.equal(asked[0].step, "read");
});

test("an empty transcript isn't readable", async () => {
  const { call } = fakeCall({ read: { readable: true, pages: 1, kind: "attempt", transcript: "  " } });
  const reading = await readWork(call, { bytes: new Uint8Array(1), contentType: "image/png", filename: "a.png" }, "Methods");
  assert.equal(reading.readable, false);
});

test("photos go to the model as images, PDFs as files", async () => {
  const { call, asked } = fakeCall({});
  await readWork(call, { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg", filename: "p.jpg" }, "Methods");
  await readWork(call, { bytes: new Uint8Array([1, 2, 3]), contentType: "application/pdf", filename: "p.pdf" }, "Methods");
  assert.equal(asked[0].messages[1].content[1].type, "image_url");
  assert.match(asked[0].messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(asked[1].messages[1].content[1].type, "file");
});

test("tagging sends the dot points and the transcript", async () => {
  const { call, asked } = fakeCall({ tag: { points: [{ id: "MM-3.4.1.3", questions: 2, quality: 100, evidence: "Q4-5" }] } });
  const tags = await tagWork(call, { readable: true, pages: 1, kind: "attempt", transcript: "Q4 int x^3 dx = x^4/4 + c" }, points);
  assert.deepEqual(tags.map((t) => [t.pointId, t.quality]), [["MM-3.4.1.3", 100]]);
  const prompt = asked[0].messages[1].content;
  assert.match(prompt, /MM-2\.5\.1\.1: Use the chain rule/);
  assert.match(prompt, /int x\^3 dx/);
});

test("notes can't show mastery: quality capped at 25", async () => {
  const { call } = fakeCall({ tag: { points: [{ id: "MM-2.5.1.1", questions: 1, quality: 100, evidence: "copied example" }] } });
  const tags = await tagWork(call, { readable: true, pages: 1, kind: "notes", transcript: "Chain rule: dy/dx = dy/du du/dx" }, points);
  assert.equal(tags[0].quality, 25);
});

test("an unparseable reply is null, so the caller can mark the work unread", async () => {
  const { call } = fakeCall({ tag: null });
  assert.equal(await tagWork(call, { readable: true, pages: 1, kind: "attempt", transcript: "x" }, points), null);
});

test("the point list groups by sub-topic", () => {
  const list = pointList(points).split("\n");
  assert.equal(list[0], "Unit 2 · Further differentiation · Differentiation rules");
  assert.equal(list.filter((line) => line.startsWith("Unit")).length, 2);
});

test("prompt version is set", () => {
  assert.match(TAGGING_PROMPT_VERSION, /^v\d+/);
});
