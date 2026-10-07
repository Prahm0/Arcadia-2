import test from "node:test";
import assert from "node:assert/strict";
import { feelingConfidence, overallFeeling, sessionTopics, splitMinutes } from "../shared/studyLog.ts";
import { blockEntries, describeRecords, summariseLog, topicMenu, untouchedTopics } from "./src/lib/study-record.ts";

const plan = {
  topic: "3.2 Limiting reagents",
  topicId: "top_32",
  steps: [
    { minutes: 10, text: "Finish off: Q6-8", topicId: "top_31", topic: "3.1 Moles" },
    { minutes: 30, text: "Work through 3.2", kind: "learn" },
    { minutes: 10, text: "Practice questions", kind: "practice" },
  ],
};

test("a plan's steps group into the topics they're on", () => {
  const topics = sessionTopics(plan, { topic: "Chemistry" });
  assert.deepEqual(
    topics.map(({ key, topic, kind, planMinutes, steps }) => ({ key, topic, kind, planMinutes, steps })),
    [
      { key: "top_31", topic: "3.1 Moles", kind: "study", planMinutes: 10, steps: [0] },
      // The longest step sets the kind.
      { key: "top_32", topic: "3.2 Limiting reagents", kind: "learn", planMinutes: 40, steps: [1, 2] },
    ],
  );
});

test("a step tagged with the session's own topic stays one topic", () => {
  const topics = sessionTopics(
    { topic: "Essay draft", steps: [{ minutes: 20, text: "Plan", topic: "essay draft" }, { minutes: 20, text: "Write" }] },
    { topic: "English" },
  );
  assert.equal(topics.length, 1);
  assert.equal(topics[0].key, "essay draft");
});

test("an Arcad plan files under the syllabus name, not its one-line topic", () => {
  const [only] = sessionTopics(
    { topic: "Limiting reagents: Q1-10 then check", topicId: "top_32", topicTitle: "3.2 Limiting reagents", steps: [{ minutes: 30, text: "Q1-10", topicId: "top_32", topic: "3.2 Limiting reagents" }] },
    { topic: "Chemistry" },
  );
  assert.deepEqual([only.key, only.topic], ["top_32", "3.2 Limiting reagents"]);
});

test("a session with no plan is one topic, the fallback", () => {
  const [only] = sessionTopics(null, { topic: "Chemistry", kind: "assignment" });
  assert.equal(only.topic, "Chemistry");
  assert.equal(only.kind, "assignment");
});

test("minutes split by the plan and add up to what was studied", () => {
  const parts = splitMinutes(sessionTopics(plan, { topic: "Chemistry" }), 37);
  assert.deepEqual(parts.map((part) => part.minutes), [7, 30]);
  assert.equal(parts.reduce((sum, part) => sum + part.minutes, 0), 37);
  // Too little time to reach a topic drops it rather than logging zero.
  assert.deepEqual(splitMinutes(sessionTopics(plan, { topic: "Chemistry" }), 1).map((part) => part.topic), ["3.2 Limiting reagents"]);
});

test("old one-tap ratings only become a confidence when they say something", () => {
  assert.equal(feelingConfidence("good"), "got_it");
  assert.equal(feelingConfidence("rough"), "lost");
  assert.equal(feelingConfidence("ok"), null);
  assert.equal(overallFeeling(["got_it", "shaky"]), "ok");
  assert.equal(overallFeeling([null, null]), null);
});

test("a checked-out block logs each topic with its rating and the leftover on the unfinished step", () => {
  const entries = blockEntries(
    { title: "Chemistry study", subject: "Chemistry", taskId: null, plan: JSON.stringify(plan) },
    50,
    { ratings: new Map([["top_32", "shaky"]]), done: [0, 1], leftover: "Q9-12", feeling: null },
  );
  assert.deepEqual(entries, [
    { topicId: "top_31", topic: "3.1 Moles", kind: "study", minutes: 10, confidence: null, note: "" },
    { topicId: "top_32", topic: "3.2 Limiting reagents", kind: "learn", minutes: 40, confidence: "shaky", note: "Q9-12" },
  ]);
});

test("a block ticked done without a check-out logs unrated", () => {
  const entries = blockEntries({ title: "Prac report", subject: "Chemistry", taskId: "task_1", plan: null }, 45, null);
  assert.deepEqual(entries, [{ topicId: null, topic: "Prac report", kind: "assignment", minutes: 45, confidence: null, note: "" }]);
});

test("time with no topic to file it under logs against the subject only", () => {
  // No plan and no deadline: the subject name isn't a topic.
  const [plain] = blockEntries({ title: "Chemistry study", taskId: null, plan: null }, 30, null);
  assert.equal(plain.topic, "");
  // An "Open study" plan made without a syllabus isn't a topic either.
  const open = { topic: "Open study", needsSyllabus: { subjectId: null, subject: "Chemistry" }, steps: [{ minutes: 30, text: "Work on whatever felt least solid" }] };
  const [openEntry] = blockEntries({ title: "Chemistry study", taskId: null, plan: JSON.stringify(open) }, 30, null);
  assert.equal(openEntry.topic, "");
  assert.equal(openEntry.minutes, 30);
  // And the record leaves it out.
  assert.deepEqual(summariseLog([{ topicId: null, topic: "", minutes: 30, confidence: null, note: "", studiedAt: 1, eventId: "ev", activityId: null }]), []);
});

const day = Date.parse("2026-09-20T09:00:00Z");
const rows = [
  { topicId: "top_32", topic: "3.2 Limiting reagents", minutes: 30, confidence: "got_it", note: "", studiedAt: day + 3 * 86_400_000, eventId: "ev_3", activityId: null },
  { topicId: "top_32", topic: "3.2 Limiting reagents", minutes: 25, confidence: "shaky", note: "Q7-9", studiedAt: day, eventId: "ev_1", activityId: null },
  { topicId: "top_31", topic: "3.1 Moles", minutes: 10, confidence: null, note: "", studiedAt: day, eventId: "ev_1", activityId: null },
  { topicId: null, topic: "Titration prac", minutes: 20, confidence: "lost", note: "", studiedAt: day + 86_400_000, eventId: null, activityId: "act_1" },
];

test("the log folds into one record per topic, newest first, latest rating winning", () => {
  const records = summariseLog(rows);
  assert.deepEqual(
    records.map(({ topic, sessions, minutes, confidence, note }) => ({ topic, sessions, minutes, confidence, note })),
    [
      { topic: "3.2 Limiting reagents", sessions: 2, minutes: 55, confidence: "got_it", note: "Q7-9" },
      { topic: "Titration prac", sessions: 1, minutes: 20, confidence: "lost", note: "" },
      { topic: "3.1 Moles", sessions: 1, minutes: 10, confidence: null, note: "" },
    ],
  );
});

test("the record reads as short capped lines for Arcad", () => {
  const lines = describeRecords(summariseLog(rows), "Australia/Brisbane", 2);
  assert.deepEqual(lines, [
    "3.2 Limiting reagents: 2 sessions, 55 min, last Wed 23 Sept, felt solid, left: Q7-9",
    "Titration prac: 1 session, 20 min, last Mon 21 Sept, lost on it",
  ]);
});

test("gaps are taught topics with nothing logged, oldest first", () => {
  const topics = [
    { id: "top_33", title: "3.3 Percentage yield", startsOn: "2026-10-05" },
    { id: "top_32", title: "3.2 Limiting reagents", startsOn: "2026-09-14" },
    { id: "top_22", title: "2.2 Bonding", startsOn: "2026-08-10" },
    { id: "top_21", title: "2.1 Atomic structure", startsOn: "2026-08-03" },
    { id: "top_x", title: "Titration prac", startsOn: "2026-09-01" },
  ];
  const gaps = untouchedTopics(topics, summariseLog(rows), "2026-09-25");
  assert.deepEqual(gaps.map((topic) => topic.id), ["top_21", "top_22"]);
});

test("Arcad's topic menu adds the gaps only for paid tiers, tagged and capped", () => {
  const inputs = {
    brief: { topic: { id: "top_33", title: "3.3 Percentage yield", upcoming: false }, previousTopic: { id: "top_32", title: "3.2 Limiting reagents" } },
    lastCheckouts: [{ topicId: "top_32", topic: "3.2 Limiting reagents" }],
    record: summariseLog(rows),
    untouched: [{ id: "top_21", title: "2.1 Atomic structure" }],
  };
  const free = topicMenu({ ...inputs, paid: false });
  assert.deepEqual(free.map((item) => `${item.tag} ${item.title}`), ["T1 3.3 Percentage yield", "T2 3.2 Limiting reagents"]);
  const pro = topicMenu({ ...inputs, paid: true });
  assert.deepEqual(pro.map((item) => `${item.tag} ${item.title} (${item.note})`), [
    "T1 3.3 Percentage yield (this week's class topic)",
    "T2 3.2 Limiting reagents (last class topic)",
    "T3 Titration prac (lost on it last time)",
    "T4 2.1 Atomic structure (taught, not studied yet)",
  ]);
});
