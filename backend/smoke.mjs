// End-to-end smoke test against `wrangler dev`. Not part of the deploy.
const BASE = process.env.BASE || "http://127.0.0.1:8787";

let cookie = "";
let csrf = "";
let failures = 0;

async function call(path, { method = "GET", body, expect = 200 } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (csrf && method !== "GET") headers["x-csrf-token"] = csrf;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const entry of setCookie) {
    const [pair] = entry.split(";");
    if (pair.startsWith("arcadia_session=")) cookie = pair;
  }

  const type = response.headers.get("content-type") || "";
  const data = type.includes("json") ? await response.json() : await response.text();
  if (data && typeof data === "object" && typeof data.csrfToken === "string") {
    csrf = data.csrfToken;
  }

  const ok = response.status === expect;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${method} ${path} -> ${response.status} (expected ${expect})`,
  );
  if (!ok) console.log("     ", JSON.stringify(data).slice(0, 300));
  return data;
}

const email = `smoke-${Date.now()}@example.com`;
const password = "correct-horse-battery";

console.log("--- auth ---");
await call("/health");
await call("/api/dashboard", { expect: 401 });

const registered = await call("/api/auth/register", {
  method: "POST",
  body: { name: "Smoke Test", email, password },
});
if (!registered.verificationToken) {
  console.log("FAIL  expected a verification token back with no mail provider");
  failures += 1;
}

await call("/api/auth/login", { method: "POST", body: { email, password }, expect: 403 });
await call(`/api/auth/verify?token=${encodeURIComponent(registered.verificationToken)}`);
await call("/api/auth/login", { method: "POST", body: { email, password: "wrong" }, expect: 401 });
await call("/api/auth/login", { method: "POST", body: { email, password } });

console.log("--- csrf ---");
{
  const saved = csrf;
  csrf = "not-the-right-token";
  await call("/api/account", { method: "PATCH", body: { name: "Nope" }, expect: 403 });
  csrf = saved;
}

console.log("--- onboarding ---");
await call("/api/onboarding", {
  method: "POST",
  body: {
    name: "Smoke Test",
    grade: "Year 11",
    timezone: "Australia/Brisbane",
    subjects: [
      { name: "Specialist Mathematics", color: "#8ab4f8", priority: 2 },
      { name: "Physics", color: "#f28b82", priority: 2 },
    ],
    tasks: [],
    commitments: [],
    preferences: {
      wakeTime: "06:30",
      bedtime: "22:30",
      minimumSleepMinutes: 480,
      maxDailyStudyMinutes: 180,
      preferredSessionMinutes: 50,
      breakMinutes: 15,
    },
  },
});

console.log("--- tasks and commitments ---");
const dueAt = new Date(Date.now() + 4 * 86400000).toISOString();
const task = await call("/api/tasks", {
  method: "POST",
  expect: 201,
  body: {
    title: "Physics prac report",
    subject: "Physics",
    taskType: "assignment",
    dueAt,
    estimatedMinutes: 180,
    priority: 2,
  },
});

await call("/api/commitments", {
  method: "POST",
  expect: 201,
  body: {
    title: "Rowing training",
    category: "sport",
    recurrence: "weekly",
    weekday: 2,
    startDate: null,
    startTime: "16:00",
    endTime: "18:00",
    notes: "",
  },
});
await call("/api/commitments", {
  method: "POST",
  expect: 422,
  body: { title: "Bad times", recurrence: "weekly", weekday: 1, startTime: "18:00", endTime: "16:00" },
});

console.log("--- dashboard ---");
const dash = await call("/api/dashboard");
const checks = [
  ["user.email", dash.user?.email === email],
  ["csrfToken present", typeof dash.csrfToken === "string"],
  ["profile.onboardingComplete", dash.profile?.onboardingComplete === true],
  ["subjects seeded", dash.subjects?.length === 2],
  ["task listed", dash.tasks?.some((t) => t.id === task.id)],
  ["study blocks scheduled", dash.events?.some((e) => e.category === "study")],
  ["sleep blocks scheduled", dash.events?.some((e) => e.category === "sleep")],
  ["commitment scheduled", dash.events?.some((e) => e.category === "sport")],
  ["range is 7 days", dash.range && Date.parse(dash.range.end) > Date.parse(dash.range.start)],
  ["assistant reports unconfigured", dash.assistant?.configured === false],
];
for (const [label, pass] of checks) {
  if (!pass) failures += 1;
  console.log(`${pass ? "ok  " : "FAIL"} ${label}`);
}

const studyBlock = dash.events.find((e) => e.category === "study");
if (studyBlock) {
  const noOverlap = !dash.events.some(
    (other) =>
      other.id !== studyBlock.id &&
      other.category !== "study" &&
      Date.parse(other.startAt) < Date.parse(studyBlock.endAt) &&
      Date.parse(studyBlock.startAt) < Date.parse(other.endAt),
  );
  if (!noOverlap) failures += 1;
  console.log(`${noOverlap ? "ok  " : "FAIL"} study block does not clash with sleep or sport`);
}

console.log("--- outcomes and analytics ---");
if (studyBlock) {
  await call(`/api/events/${encodeURIComponent(studyBlock.id)}/outcome`, {
    method: "POST",
    body: { outcome: "completed" },
  });
  const after = await call("/api/dashboard");
  const stillThere = after.events.find((e) => e.id === studyBlock.id);
  const kept = stillThere?.outcome === "completed";
  if (!kept) failures += 1;
  console.log(`${kept ? "ok  " : "FAIL"} completed block survives a re-plan`);
}

await call("/api/study-sessions", {
  method: "POST",
  expect: 201,
  body: [
    {
      type: "focus",
      seconds: 3000,
      subject: "Physics",
      goal: "Draft method",
      distractions: 1,
      endedAt: new Date().toISOString(),
    },
  ],
});

const stats = await call("/api/analytics?period=week");
const analyticsOk =
  stats.daily?.length === 7 && stats.current?.minutes === 50 && stats.streaks?.current === 1;
if (!analyticsOk) failures += 1;
console.log(`${analyticsOk ? "ok  " : "FAIL"} analytics totals (50 min, streak 1)`);

console.log("--- assistant without a key ---");
await call("/api/conversations");
const chatState = await call("/api/chat");
if (!chatState.conversationId) {
  failures += 1;
  console.log("FAIL  chat did not open a conversation");
}

console.log("--- waitlist ---");
await call("/api/waitlist", { method: "POST", body: { email: "someone@example.com" } });
await call("/api/waitlist", { method: "POST", body: { email: "someone@example.com" } });
await call("/api/waitlist", { method: "POST", body: { email: "nope" }, expect: 422 });

console.log("--- isolation ---");
{
  const otherEmail = `smoke-other-${Date.now()}@example.com`;
  const savedCookie = cookie;
  const savedCsrf = csrf;
  cookie = "";
  csrf = "";
  const other = await call("/api/auth/register", {
    method: "POST",
    body: { name: "Other", email: otherEmail, password },
  });
  await call(`/api/auth/verify?token=${encodeURIComponent(other.verificationToken)}`);
  await call("/api/auth/login", { method: "POST", body: { email: otherEmail, password } });
  await call(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE", expect: 404 });
  cookie = savedCookie;
  csrf = savedCsrf;
}

console.log("--- logout ---");
await call("/api/auth/logout", { method: "POST" });
await call("/api/dashboard", { expect: 401 });

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
