// Local integration test: creates its own disposable accounts, never uses an existing session.
import assert from "node:assert/strict";
const base = process.env.BASE || "http://127.0.0.1:8787";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("This test is restricted to a local development API.");
async function account(name) {
  let cookie = "", csrf = "";
  const email = `${name}-${Date.now()}@example.com`, password = "local-sky-test-only-9472";
  async function call(path, method = "GET", body, expected = 200) {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie, "x-csrf-token": csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const entry of response.headers.getSetCookie()) if (entry.startsWith("arcadia_session=")) cookie = entry.split(";")[0];
    const result = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`);
    if (result.csrfToken) csrf = result.csrfToken;
    return result;
  }
  const registered = await call("/api/auth/register", "POST", { name: "Sky Preview", email, password });
  assert.ok(registered.verificationToken, "Run without a mail provider");
  await call(`/api/auth/verify?token=${registered.verificationToken}`);
  await call("/api/auth/login", "POST", { email, password });
  await call("/api/onboarding", "POST", { name: "Sky Preview", grade: "Year 11", timezone: "Australia/Sydney", subjects: [{ name: "Maths", color: "#8ab4f8" }, { name: "Biology", color: "#aabda5" }, { name: "English", color: "#bcb2d3" }], tasks: [], commitments: [], preferences: { wakeTime: "07:00", bedtime: "22:00", minimumSleepMinutes: 480, maxDailyStudyMinutes: 120, preferredSessionMinutes: 25, breakMinutes: 5 } });
  return { call, email, password };
}
const user = await account("constellation-test");
let sky = await user.call("/api/constellations");
assert.equal(sky.cards.length, 4);
assert.equal(sky.cards.filter((item) => item.earnedAt).length, 0);
await user.call("/api/constellations", "PATCH", { featured: "scholar" }, 422);
await user.call("/api/constellations", "PATCH", { ambientMotion: "yes" }, 422);
const first = { activityId: "first-session-0001", type: "focus", seconds: 1200, subject: "Maths", endedAt: new Date(Date.now() - 14 * 86400000).toISOString() };
assert.equal((await user.call("/api/study-sessions", "POST", first, 201)).stored, 1);
assert.equal((await user.call("/api/study-sessions", "POST", first, 201)).stored, 0);
sky = await user.call("/api/constellations");
assert.equal(sky.cards.find((item) => item.id === "first-light").value, 20);
const earnedAt = sky.cards.find((item) => item.id === "first-light").earnedAt;
assert.ok(earnedAt);
await user.call("/api/constellations", "PATCH", { followed: "sentinel", featured: "first-light", backdrop: "first-light", showcase: ["first-light"], favourites: ["first-light"], ambientMotion: false });
await user.call("/api/constellations/first-light/seen", "POST");
const sessions = Array.from({ length: 6 }, (_, i) => ({ activityId: `day-session-${i}-0001`, type: "focus", seconds: 900, subject: i % 2 ? "Biology" : "English", endedAt: new Date(Date.now() - (12 - i * 2) * 86400000).toISOString() }));
await Promise.all([user.call("/api/study-sessions", "POST", sessions, 201), user.call("/api/study-sessions", "POST", sessions, 201)]);
sky = await user.call("/api/constellations");
assert.equal(sky.cards.find((item) => item.id === "first-light").value, 110);
assert.equal(sky.cards.find((item) => item.id === "sentinel").value, 7);
assert.ok(sky.cards.find((item) => item.id === "sentinel").earnedAt);
assert.ok(sky.cards.find((item) => item.id === "voyager").earnedAt);
assert.equal(sky.cards.find((item) => item.id === "first-light").earnedAt, earnedAt);
assert.equal(sky.cards.find((item) => item.id === "first-light").seen, true);
assert.equal(sky.preferences.featured, "first-light");
await user.call("/api/constellations", "PATCH", { showcase: ["first-light", "first-light"] }, 422);
await user.call("/api/constellations/scholar/seen", "POST", undefined, 404);
const second = await account("sky-preview");
assert.equal((await second.call("/api/constellations")).preferences.featured, null);
await second.call("/api/constellations/first-light/seen", "POST", undefined, 404);
await second.call("/api/study-sessions", "POST", [{ ...first, activityId: "preview-first-0001", seconds: 1800 }, { ...first, activityId: "preview-next-0001", seconds: 900, subject: "Biology", endedAt: new Date(Date.now() - 86400000).toISOString() }], 201);
await second.call("/api/constellations", "PATCH", { followed: "sentinel", featured: "first-light", backdrop: "first-light", showcase: ["first-light"] });
console.log("PASS: earning, concurrent retries, permanent dates, appearance persistence, validation and account isolation");
console.log(`Local preview account: ${second.email} / ${second.password}`);
