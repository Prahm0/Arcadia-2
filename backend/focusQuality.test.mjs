import test from "node:test";
import assert from "node:assert/strict";
import { lockInBonusXp } from "../shared/progress.ts";

test("lock-in bonus rises only for strong, valid self-reported focus", () => {
  assert.equal(lockInBonusXp(1), 0);
  assert.equal(lockInBonusXp(6), 0);
  assert.equal(lockInBonusXp(7), 2);
  assert.equal(lockInBonusXp(8), 4);
  assert.equal(lockInBonusXp(9), 6);
  assert.equal(lockInBonusXp(10), 8);
  assert.equal(lockInBonusXp(11), 0);
  assert.equal(lockInBonusXp(7.5), 0);
});
