import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeMastery, decayFactor, rankPriorities, reasonFor, WEIGHTS } from "../shared/mastery.ts";
import { flattenSyllabus, suggestSyllabus } from "../shared/syllabusPoints.ts";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 5);
const tag = (quality, daysAgo = 0, confidence = null, pages = 1) => ({ quality, confidence, at: now - daysAgo * DAY, pages });
const evidence = (tags, results = [], taught = true) => ({ tags, results, minutes: 0, taught });

test("no work: neglected once taught, otherwise not started", () => {
  assert.equal(computeMastery(evidence([]), now).band, "neglected");
  assert.equal(computeMastery(evidence([], [], false), now).band, "none");
  assert.equal(computeMastery(evidence([]), now).score, 0);
});

test("without results, R's weight is shared across the other signals", () => {
  const m = computeMastery(evidence([tag(80)]), now);
  const share = WEIGHTS.q + WEIGHTS.c + WEIGHTS.e;
  const expected = (WEIGHTS.q * m.q + WEIGHTS.c * m.c + WEIGHTS.e * m.e) / share;
  assert.ok(Math.abs(m.score - expected) < 0.2, `${m.score} vs ${expected}`);
  assert.equal(m.r, null);
});

test("a mark pulls the score toward it", () => {
  const without = computeMastery(evidence([tag(60), tag(60, 1)]), now);
  const high = computeMastery(evidence([tag(60), tag(60, 1)], [{ fraction: 0.95, at: now }]), now);
  const low = computeMastery(evidence([tag(60), tag(60, 1)], [{ fraction: 0.2, at: now }]), now);
  assert.ok(high.score > without.score);
  assert.ok(low.score < without.score);
});

test("better work scores higher, and so does more of it", () => {
  assert.ok(computeMastery(evidence([tag(90)]), now).score > computeMastery(evidence([tag(40)]), now).score);
  const one = computeMastery(evidence([tag(80)]), now).score;
  const four = computeMastery(evidence([tag(80), tag(80, 1), tag(80, 2), tag(80, 3)]), now).score;
  assert.ok(four > one);
});

test("volume can't buy mastery: lots of poor work stays weak", () => {
  const tags = Array.from({ length: 20 }, (_, i) => tag(10, i, null, 5));
  const m = computeMastery(evidence(tags), now);
  assert.equal(m.band, "weak");
  assert.equal(m.reason, "low_quality");
});

test("decay: about 10% every three weeks", () => {
  assert.equal(decayFactor(now, now), 1);
  assert.ok(Math.abs(decayFactor(now - 21 * DAY, now) - 0.9) < 1e-9);
  const fresh = computeMastery(evidence([tag(90), tag(90), tag(90), tag(90)]), now);
  const old = computeMastery(evidence([tag(90, 63), tag(90, 63), tag(90, 63), tag(90, 63)]), now);
  assert.ok(old.score < fresh.score);
  assert.equal(old.reason, "decaying");
});

test("a strong point left long enough falls to neglected", () => {
  const tags = [tag(95, 300), tag(95, 300), tag(95, 300), tag(95, 300), tag(95, 300)];
  assert.equal(computeMastery(evidence(tags), now).band, "neglected");
});

test("check-in confidence blends into quality", () => {
  const sure = computeMastery(evidence([tag(80, 0, 5)]), now);
  const unsure = computeMastery(evidence([tag(80, 0, 1)]), now);
  assert.ok(sure.q > unsure.q);
  assert.equal(sure.confidence, 5);
});

test("reasons follow what's holding the point back", () => {
  assert.equal(reasonFor({ q: 40, c: 80, decay: 1, confidence: 4, works: 3 }), "low_quality");
  assert.equal(reasonFor({ q: 80, c: 22, decay: 1, confidence: 4, works: 1 }), "low_coverage");
  assert.equal(reasonFor({ q: 80, c: 80, decay: 0.7, confidence: 4, works: 5 }), "decaying");
  assert.equal(reasonFor({ q: 80, c: 80, decay: 1, confidence: 2, works: 5 }), "low_confidence");
  assert.equal(reasonFor({ q: 90, c: 80, decay: 1, confidence: 5, works: 5 }), null);
});

test("priorities: weakest first, untouched/snoozed/covered/strong left out", () => {
  const weak = computeMastery(evidence([tag(20)]), now);
  const middling = computeMastery(evidence([tag(60), tag(60)]), now);
  const strong = computeMastery(evidence([tag(95), tag(95), tag(95), tag(95), tag(95), tag(95)]), now);
  const none = computeMastery(evidence([]), now);
  const ranked = rankPriorities(
    [
      { pointId: "a", mastery: middling, hours: 1 },
      { pointId: "b", mastery: weak, hours: 1 },
      { pointId: "c", mastery: strong, hours: 1 },
      { pointId: "d", mastery: none, hours: 1 },
      { pointId: "e", mastery: weak, hours: 1, snoozedUntil: now + DAY },
      { pointId: "f", mastery: weak, hours: 1, coveredElsewhere: true },
    ],
    now,
  );
  assert.deepEqual(ranked.map((p) => p.pointId), ["b", "a"]);
  assert.equal(ranked[0].reason, "low_quality");
});

test("an assessment coming up lifts its points", () => {
  const m = computeMastery(evidence([tag(60)]), now);
  const ranked = rankPriorities(
    [
      { pointId: "later", mastery: m, hours: 1 },
      { pointId: "soon", mastery: m, hours: 1, dueInDays: 3 },
    ],
    now,
  );
  assert.equal(ranked[0].pointId, "soon");
});

test("the Methods seed flattens to stable ids", () => {
  const doc = JSON.parse(readFileSync(new URL("../shared/syllabus/qcaa-methods.json", import.meta.url), "utf8"));
  const points = flattenSyllabus(doc);
  assert.ok(points.length > 150, `${points.length} points`);
  assert.equal(points[0].id, "MM-1.1.1.1");
  assert.equal(new Set(points.map((p) => p.id)).size, points.length);
  assert.deepEqual([...new Set(points.map((p) => p.unit))], [1, 2, 3, 4]);
  assert.ok(points.every((p) => p.hours > 0 && p.text.length > 10));
});

test("subject names suggest the Methods syllabus", () => {
  assert.equal(suggestSyllabus("Maths Methods"), "qcaa-methods-2025");
  assert.equal(suggestSyllabus("Mathematical Methods"), "qcaa-methods-2025");
  assert.equal(suggestSyllabus("Specialist Maths"), null);
  assert.equal(suggestSyllabus("General Mathematics"), null);
});
