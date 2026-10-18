import test from "node:test";
import assert from "node:assert/strict";
import { blockTimeBlocks, blockTimeDays, blockTimeRange } from "./blockTimes.ts";

const HOUR = 3_600_000;
// Sunday 18 October 2026, 8pm, in the machine's own time zone.
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test("a nightly block runs past midnight and is included while it's on", () => {
  const night = { id: "n", label: "Night", days: [0, 1, 2, 3, 4, 5, 6], start: 21 * 60, end: 7 * 60 };
  const blocks = blockTimeBlocks([night], at(2026, 10, 18, 23), 36 * HOUR);
  assert.equal(blocks[0].startsAt, at(2026, 10, 18, 21));
  assert.equal(blocks[0].endsAt, at(2026, 10, 19, 7));
  assert.equal(blocks[0].subject, "Night");
  // Tomorrow night is inside the 36 hours too.
  assert.equal(blocks[1].startsAt, at(2026, 10, 19, 21));
  assert.equal(new Set(blocks.map((block) => block.id)).size, blocks.length);
});

test("weekday blocks skip the weekend, and past ones are left out", () => {
  const afterSchool = { id: "a", label: "", days: [1, 2, 3, 4, 5], start: 16 * 60, end: 18 * 60 };
  const blocks = blockTimeBlocks([afterSchool], at(2026, 10, 17, 9), 60 * HOUR); // Saturday morning, through Monday evening
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].startsAt, at(2026, 10, 19, 16)); // Monday
  assert.equal(blocks[0].subject, "Focus time");
});

test("labels for days and times read plainly", () => {
  assert.equal(blockTimeDays([1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(blockTimeDays([0, 6]), "Weekends");
  assert.equal(blockTimeDays([6, 0, 1, 2, 3, 4, 5]), "Every day");
  assert.equal(blockTimeDays([1, 3]), "Mon, Wed");
  assert.equal(blockTimeRange({ start: 21 * 60, end: 7 * 60 }), "9:00pm to 7:00am");
});
