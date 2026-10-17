import test from "node:test";
import assert from "node:assert/strict";
import { attemptsLine, guardedBlocks, liveBlock, shieldTitle } from "./autoBlocking.ts";

const now = Date.parse("2026-10-17T05:00:00Z");
const at = (minutes) => new Date(now + minutes * 60_000).toISOString();
const event = (id, from, to, extra = {}) => ({ id, title: id, subject: "Chemistry", category: "study", startAt: at(from), endAt: at(to), status: "planned", outcome: "planned", ...extra });

test("planned study blocks from now on block apps; life lines, ticked and finished blocks don't", () => {
  const blocks = guardedBlocks([
    event("live", -10, 40),
    event("later", 60, 110),
    event("done", -60, -10),
    event("ticked", 120, 170, { outcome: "completed" }),
    event("nap", 200, 230, { category: "other", subject: null, title: "Power nap" }),
    event("tomorrow-far", 60 * 40, 60 * 41),
  ], now);
  assert.deepEqual(blocks.map((block) => block.id), ["live", "later"]);
  assert.equal(liveBlock(blocks, now).id, "live");
  assert.equal(liveBlock(blocks, now + 45 * 60_000), null);
});

test("a timed line naming a subject is study and blocks too", () => {
  const blocks = guardedBlocks([event("chem-line", 5, 35, { source: "note", title: "Chem 3:30" })], now);
  assert.equal(blocks.length, 1);
});

test("the block screen and the done screen read plainly", () => {
  assert.equal(shieldTitle({ subject: "Chemistry", endsAt: now + 32 * 60_000 }, now), "Chemistry, 32 min left");
  assert.equal(attemptsLine(0), "Your phone stayed out of it.");
  assert.equal(attemptsLine(1), "You reached for a blocked app once.");
  assert.equal(attemptsLine(2), "You reached for blocked apps twice.");
  assert.equal(attemptsLine(5), "You reached for blocked apps 5 times.");
});
