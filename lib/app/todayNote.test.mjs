import test from "node:test";
import assert from "node:assert/strict";
import { noteEntries } from "./todayNote.ts";

const day = Date.parse("2026-10-17T00:00:00Z");
const at = (h, m = 0) => new Date(day + (h * 60 + m) * 60000).toISOString();
let clock = Date.parse("2026-10-16T22:00:00Z");
const typedNow = () => new Date((clock += 1000)).toISOString();
const line = (id, h, m, end) => ({ id, title: id, category: "other", source: "note", startAt: at(h, m), endAt: end ?? at(h, m + 30), status: "planned", outcome: "planned", createdAt: typedNow() });
const item = (id, extra = {}) => ({ id, day: "2026-10-17", text: id, subject: null, note: "", evening: false, done: false, position: 0, createdAt: typedNow(), ...extra });
const block = (id, h, m) => ({ id, title: id, category: "study", source: "auto", startAt: at(h, m), endAt: at(h, m + 50), status: "planned", outcome: "planned", createdAt: "2026-10-10T00:00:00Z" });

test("the day note reads in time order, untimed lines after the line typed before them", () => {
  // Typed in this order, as in the Apple Notes example.
  const wake = line("Wake", 7, 30);
  const slc = line("SLC", 10, 50);
  const work = line("Back to work", 12, 0);
  const nap = line("Power nap", 14, 15, at(14, 45));
  const pari = item("Call with Pari", { position: 1 });
  const interview = item("Practising interview", { evening: true, position: 2 });
  const chem = block("Chemistry", 15, 30);
  const order = noteEntries([chem, nap, wake, work, slc], [interview, pari], day).map((entry) => entry.key);
  assert.deepEqual(order, ["Wake", "SLC", "Back to work", "Power nap", "Call with Pari", "Chemistry", "Practising interview"]);
});

test("untimed lines typed first sit at the top, in typed order", () => {
  const a = item("First", { position: 1 });
  const b = item("Second", { position: 2 });
  const order = noteEntries([block("Chemistry", 9, 0)], [b, a], day).map((entry) => entry.key);
  assert.deepEqual(order, ["First", "Second", "Chemistry"]);
});

test("only the student's own lines anchor untimed ones, not Arcadia's blocks", () => {
  const order = noteEntries([block("Methods", 16, 0)], [item("Laundry")], day).map((entry) => entry.key);
  assert.deepEqual(order, ["Laundry", "Methods"]);
});
