import test from "node:test";
import assert from "node:assert/strict";
import { closesRing, comboCount, flameScale, isPerfectDay, splitDone } from "./celebrate.ts";

const MIN = 60_000;

test("ticks within twenty minutes of each other make a combo", () => {
  assert.equal(comboCount([]), 0);
  assert.equal(comboCount([0]), 1);
  assert.equal(comboCount([0, 10 * MIN]), 2);
  assert.equal(comboCount([0, 10 * MIN, 25 * MIN]), 3);
  assert.equal(comboCount([0, 50 * MIN, 55 * MIN]), 2);
  assert.equal(comboCount([55 * MIN, 0, 50 * MIN]), 2);
});

test("a perfect day needs everything done and more than one thing", () => {
  assert.equal(isPerfectDay([{ done: true }, { done: true }]), true);
  assert.equal(isPerfectDay([{ done: true }, { done: false }]), false);
  assert.equal(isPerfectDay([{ done: true }]), false);
  assert.equal(isPerfectDay([]), false);
});

test("only the tick that crosses the goal closes the ring", () => {
  assert.equal(closesRing(100, 150, 150), true);
  assert.equal(closesRing(150, 200, 150), false);
  assert.equal(closesRing(50, 100, 150), false);
  assert.equal(closesRing(0, 50, 0), false);
});

test("done rows gather at the bottom once they've settled", () => {
  const rows = [{ key: "a", done: true }, { key: "b", done: false }, { key: "c", done: true }, { key: "d", done: false }];
  const { open, done } = splitDone(rows, new Set(["c"]));
  assert.deepEqual(open.map((row) => row.key), ["b", "c", "d"]);
  assert.deepEqual(done.map((row) => row.key), ["a"]);
});

test("the flame grows with the streak and stops at a month", () => {
  assert.equal(flameScale(0), 1);
  assert.equal(flameScale(15), 1.3);
  assert.equal(flameScale(30), 1.6);
  assert.equal(flameScale(90), 1.6);
});
