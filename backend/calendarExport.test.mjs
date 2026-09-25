import test from "node:test";
import assert from "node:assert/strict";
import { buildIcs, escapeText, fold } from "./src/lib/ics-export.ts";

const calendar = {
  name: "Arcadia",
  appUrl: "https://arcadiahq.app/app/schedule",
  now: Date.parse("2026-09-25T00:00:00.000Z"),
  blocks: [
    {
      id: "evt_1",
      title: "Maths, chapter 4; practice",
      subject: "Maths",
      startAt: Date.parse("2026-09-26T06:30:00.000Z"),
      endAt: Date.parse("2026-09-26T07:15:00.000Z"),
      outcome: "planned",
    },
    {
      id: "evt_2",
      title: "Chemistry",
      subject: null,
      startAt: Date.parse("2026-09-24T06:00:00.000Z"),
      endAt: Date.parse("2026-09-24T07:00:00.000Z"),
      outcome: "completed",
    },
  ],
  deadlines: [{ id: "tsk_1", title: "English essay", subject: "English", date: "2026-09-30" }],
};

test("writes a CRLF VCALENDAR with timed blocks in UTC", () => {
  const ics = buildIcs(calendar);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "every newline is CRLF");
  assert.match(ics, /UID:evt_1@arcadiahq\.app\r\n/);
  assert.match(ics, /DTSTART:20260926T063000Z\r\nDTEND:20260926T071500Z/);
  assert.match(ics, /SUMMARY:Maths\\, chapter 4\\; practice/);
  assert.match(ics, /SUMMARY:✓ Chemistry/);
});

test("deadlines are all-day on the local due date and don't block the day", () => {
  const ics = buildIcs(calendar);
  assert.match(ics, /UID:tsk_1-due@arcadiahq\.app/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260930\r\nDTEND;VALUE=DATE:20261001/);
  assert.match(ics, /SUMMARY:Due: English essay\r\n(?:.*\r\n)*?TRANSP:TRANSPARENT/);
});

test("escapes text and folds long lines at 75 octets without splitting characters", () => {
  assert.equal(escapeText("a\\b;c,d\ne"), "a\\\\b\\;c\\,d\\ne");
  const line = `SUMMARY:${"é".repeat(60)}`;
  const folded = fold(line);
  const encoder = new TextEncoder();
  for (const part of folded.split("\r\n")) assert.ok(encoder.encode(part).length <= 75);
  assert.equal(folded.split("\r\n").map((part, i) => (i ? part.slice(1) : part)).join(""), line);
});
