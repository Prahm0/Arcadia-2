import test from "node:test";
import assert from "node:assert/strict";
import { buildRoomFeed, cheersDuring, studyGroups } from "../shared/roomFeed.ts";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-24T10:00:00Z");
const member = (userId, extra = {}) => ({ userId, joinedAt: NOW - 30 * 24 * HOUR, activity: "idle", subject: null, startedAt: null, groupHostId: null, ...extra });

test("finished sessions carry the cheers sent during them", () => {
  const cheers = [
    { id: "c1", fromUserId: "b", toUserId: "a", kind: "fire", createdAt: NOW - 30 * 60_000 },
    { id: "c2", fromUserId: "b", toUserId: "a", kind: "clap", createdAt: NOW - 3 * HOUR },
  ];
  const feed = buildRoomFeed({
    members: [member("a"), member("b")],
    sessions: [{ userId: "a", seconds: 3000, endedAt: NOW - 10 * 60_000 }],
    cheers,
    now: NOW,
    dayStart: NOW - 10 * HOUR,
    dailyGoalSeconds: null,
  });
  const session = feed.find((event) => event.type === "session");
  assert.equal(session.cheers, 1);
  assert.equal(feed.filter((event) => event.type === "cheer").length, 2);
  assert.equal(cheersDuring(cheers, "a", NOW - HOUR, NOW), 1);
});

test("a joined timer makes a group, and a group replaces the host's solo start", () => {
  const members = [
    member("host", { activity: "focus", startedAt: NOW - 5 * 60_000 }),
    member("joiner", { activity: "focus", startedAt: NOW - 5 * 60_000, groupHostId: "host" }),
    member("orphan", { activity: "focus", startedAt: NOW - 60_000, groupHostId: "idle-host" }),
    member("idle-host"),
  ];
  assert.deepEqual([...studyGroups(members).entries()], [["host", ["joiner"]]]);
  const feed = buildRoomFeed({ members, sessions: [], cheers: [], now: NOW, dayStart: NOW - HOUR, dailyGoalSeconds: null });
  assert.deepEqual(feed.filter((event) => event.type === "group").map((event) => event.userIds), [["host", "joiner"]]);
  assert.deepEqual(feed.filter((event) => event.type === "start").map((event) => event.userId), ["orphan"]);
});

test("milestones, the daily goal and rank changes come from replaying the week", () => {
  const sessions = [
    { userId: "a", seconds: 4 * 3600, endedAt: NOW - 5 * 24 * HOUR },
    { userId: "b", seconds: 2 * 3600, endedAt: NOW - 4 * 24 * HOUR },
    { userId: "b", seconds: 5 * 3600, endedAt: NOW - 2 * HOUR },
  ];
  const feed = buildRoomFeed({ members: [member("a"), member("b")], sessions, cheers: [], now: NOW, dayStart: NOW - 8 * HOUR, dailyGoalSeconds: 2 * 3600 });
  assert.deepEqual(feed.filter((event) => event.type === "milestone").map((event) => event.hours), [10]);
  assert.equal(feed.filter((event) => event.type === "goal").length, 1);
  assert.deepEqual(feed.filter((event) => event.type === "rank").map((event) => [event.userId, event.rank]), [["b", 1]]);
  // Only moments inside the 48-hour window are shown.
  assert.equal(feed.filter((event) => event.type === "session").length, 1);
});

test("people who left the room drop out of the feed", () => {
  const feed = buildRoomFeed({
    members: [member("a")],
    sessions: [{ userId: "gone", seconds: 1800, endedAt: NOW - HOUR }],
    cheers: [{ id: "c", fromUserId: "gone", toUserId: "a", kind: "star", createdAt: NOW - HOUR }],
    now: NOW,
    dayStart: NOW - 8 * HOUR,
    dailyGoalSeconds: null,
  });
  assert.deepEqual(feed, []);
});
