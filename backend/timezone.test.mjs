import test from "node:test";
import assert from "node:assert/strict";
import { messageUsageWindow } from "./src/lib/message-usage-window.ts";

test("Brisbane usage day changes at Brisbane midnight, not UTC midnight", () => {
  const zone = "Australia/Brisbane";
  const beforeMidnight = Date.parse("2026-09-24T13:59:59.000Z");
  const afterMidnight = Date.parse("2026-09-24T14:00:00.000Z");

  assert.deepEqual(messageUsageWindow(zone, beforeMidnight), {
    day: "2026-09-24",
    timezone: zone,
    resetAt: "2026-09-24T14:00:00.000Z",
  });
  assert.equal(messageUsageWindow(zone, afterMidnight).day, "2026-09-25");
});
