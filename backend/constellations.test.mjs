import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSky } from "../shared/constellations.ts";

const base = Date.parse("2026-09-01T12:00:00Z");
const session = (id, seconds, extra = {}) => ({ id, seconds, type: "focus", endedAt: base, subject: null, ...extra });
const card = (rows, id, legacy = false) => evaluateSky(rows, "Australia/Sydney", legacy).find((item) => item.id === id);
test("short sessions accumulate, breaks are excluded and duplicate records do not earn twice", () => {
  const first = session("a", 299);
  const rows = [first, first, session("b", 1), session("break", 99999, { type: "break" })];
  const result = card(rows, "first-light");
  assert.equal(result.value, 5);
  assert.deepEqual(result.milestones.map((item) => item.earnedAt), [base, null, null]);
  assert.equal(result.earnedAt, null);
});
test("completion dates follow chronological activity even when uploads arrive out of order", () => {
  const result = card([session("later", 600, { endedAt: base + 86400000 }), session("earlier", 600)], "first-light");
  assert.equal(result.milestones[1].earnedAt, base);
  assert.equal(result.earnedAt, base + 86400000);
});
test("seven nonconsecutive local days form Sentinel, multiple short sessions share one day", () => {
  const rows = Array.from({ length: 7 }, (_, i) => session(`day${i}`, 300, { endedAt: base + i * 10 * 86400000 }));
  rows.push(session("extra", 1000));
  assert.equal(card(rows, "sentinel").value, 7);
  assert.ok(card(rows, "sentinel").earnedAt);
  assert.equal(card([session("a", 150), session("b", 150)], "sentinel").value, 1);
});
test("saved local dates survive timezone changes and midnight boundaries", () => {
  const rows = [session("a", 300, { endedAt: Date.parse("2026-09-01T13:59:00Z"), localDay: "2026-09-01" }), session("b", 300, { endedAt: Date.parse("2026-09-01T14:01:00Z"), localDay: "2026-09-02" })];
  assert.equal(evaluateSky(rows, "America/Los_Angeles", false).find((item) => item.id === "sentinel").value, 2);
});
test("Voyager requires fifteen minutes per distinct subject and stable subject keys survive renaming", () => {
  const rows = [session("a", 450, { subject: "Maths", subjectKey: "subject:1" }), session("b", 450, { subject: "Mathematics", subjectKey: "subject:1" }), session("c", 899, { subject: "Biology" }), session("d", 900, { subject: "English" })];
  assert.equal(card(rows, "voyager").value, 2);
  rows.push(session("e", 1, { subject: " biology " }));
  assert.ok(card(rows, "voyager").earnedAt);
});
test("legacy sky is only available to existing students and does not cap other progress", () => {
  const rows = Array.from({ length: 16 }, (_, i) => session(String(i), 2250));
  assert.equal(card(rows, "first-sky"), undefined);
  assert.ok(card(rows, "first-sky", true).earnedAt);
  assert.ok(card(rows, "scholar", true).earnedAt);
});
test("the 88 constellations form one after another, a star per 25 minutes", async () => {
  const { CONSTELLATIONS } = await import("../shared/constellations.ts");
  const atlas = CONSTELLATIONS.filter((item) => item.atlas);
  assert.equal(atlas.length, 88);
  assert.equal(new Set(CONSTELLATIONS.map((item) => item.id)).size, CONSTELLATIONS.length);
  for (const item of atlas) {
    assert.equal(item.points.length, item.thresholds.length);
    assert.equal(item.mags.length, item.points.length);
    assert.ok(item.edges.every(([a, b]) => a < item.points.length && b < item.points.length));
  }
  const [first, second] = atlas;
  const minutes = (first.points.length + 1) * 25;
  const cards = evaluateSky([session("long", minutes * 60)], "Australia/Sydney", false);
  assert.ok(cards.find((item) => item.id === first.id).earnedAt);
  assert.deepEqual(cards.find((item) => item.id === second.id).milestones.map((star) => star.earnedAt !== null).slice(0, 2), [true, false]);
  assert.equal(cards.find((item) => item.id === atlas[2].id).milestones.some((star) => star.earnedAt !== null), false);
});
