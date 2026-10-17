import test from "node:test";
import assert from "node:assert/strict";
import { blockDoneDecision } from "./blockDone.ts";

const HOUR = 3_600_000;
const now = Date.parse("2026-10-17T20:00:00Z");
const endedAgo = (ms) => ({ endAt: new Date(now - ms).toISOString() });

test("a block just finished gets the moment", () => {
  assert.equal(blockDoneDecision(endedAgo(10 * 60_000), 0, now).show, true);
});

test("a block that ended over two hours ago ticks quietly", () => {
  assert.equal(blockDoneDecision(endedAgo(2 * HOUR + 60_000), 0, now).show, false);
  assert.equal(blockDoneDecision(endedAgo(2 * HOUR - 60_000), 0, now).show, true);
});

test("only the first of several quick ticks gets the moment", () => {
  const first = blockDoneDecision(endedAgo(0), 0, now);
  assert.equal(first.show, true);
  assert.equal(blockDoneDecision(endedAgo(0), first.at, now + 30_000).show, false);
  assert.equal(blockDoneDecision(endedAgo(0), first.at, now + 10 * 60_000).show, true);
});

test("a block still running counts as just finished", () => {
  assert.equal(blockDoneDecision({ endAt: new Date(now + HOUR).toISOString() }, 0, now).show, true);
});
