import test from "node:test";
import assert from "node:assert/strict";
import { formatBlockTime, inDailyPlanWindow, inSendWindow, inWeeklySummaryWindow, lastActiveAt, skipReason } from "./src/lib/email-reminder-rules.ts";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./src/lib/email-unsubscribe.ts";
import { studyPlanEmail, weeklySummaryEmail } from "./src/lib/email.ts";

const DAY = 86_400_000;

test("the send window is 4pm in each student's own timezone", () => {
  // 06:00 UTC is 16:00 in Brisbane (+10) and 02:00 in London.
  const at = Date.parse("2026-10-01T06:00:00Z");
  assert.equal(inSendWindow("Australia/Brisbane", at), true);
  assert.equal(inSendWindow("Europe/London", at), false);
  assert.equal(inSendWindow("Australia/Brisbane", at + 29 * 60_000), true);
  assert.equal(inSendWindow("Australia/Brisbane", at + 31 * 60_000), false);
  assert.equal(inSendWindow("Australia/Brisbane", at - 60_000), false);
});

test("the weekly recap is Sunday at 6pm in the student's own timezone", () => {
  // 08:00 UTC is Sunday 18:00 in Brisbane (+10).
  const at = Date.parse("2026-10-04T08:00:00Z");
  assert.equal(inWeeklySummaryWindow("Australia/Brisbane", at), true);
  assert.equal(inWeeklySummaryWindow("Australia/Brisbane", at + 29 * 60_000), true);
  assert.equal(inWeeklySummaryWindow("Australia/Brisbane", at + 31 * 60_000), false);
  assert.equal(inWeeklySummaryWindow("Europe/London", at), false);
  // Sunday gets the recap, not a second 4pm plan email.
  assert.equal(inDailyPlanWindow("Australia/Brisbane", Date.parse("2026-10-04T06:00:00Z")), false);
  assert.equal(inDailyPlanWindow("Australia/Brisbane", Date.parse("2026-10-05T06:00:00Z")), true);
});

test("skip rules: inactive 14+ days, completed today, no blocks", () => {
  const now = Date.parse("2026-10-01T06:00:00Z");
  const base = { now, lastActive: now - DAY, completedToday: false, plannedBlocks: 2 };
  assert.equal(skipReason(base), null);
  assert.equal(skipReason({ ...base, lastActive: now - 14 * DAY }), "inactive");
  assert.equal(skipReason({ ...base, lastActive: now - 13 * DAY }), null);
  assert.equal(skipReason({ ...base, completedToday: true }), "completed_today");
  assert.equal(skipReason({ ...base, plannedBlocks: 0 }), "no_blocks");
});

test("last activity takes the latest of active day, sign-in and signup", () => {
  const createdAt = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(lastActiveAt({ activeDay: null, lastSignInAt: null, createdAt }), createdAt);
  assert.equal(lastActiveAt({ activeDay: "2026-09-30", lastSignInAt: null, createdAt }), Date.parse("2026-10-01T00:00:00Z") - 1);
});

test("block times read like 4:30 pm", () => {
  assert.equal(formatBlockTime(Date.parse("2026-10-01T06:30:00Z"), "Australia/Brisbane"), "4:30 pm");
});

test("unsubscribe tokens verify, and tampering fails", async () => {
  const env = { TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
  const token = await signUnsubscribeToken(env, "user-1");
  assert.equal(await verifyUnsubscribeToken(env, token), "user-1");
  assert.equal(await verifyUnsubscribeToken(env, token.replace("user-1", "user-2")), null);
  assert.equal(await verifyUnsubscribeToken(env, `${token}x`), null);
  assert.equal(await verifyUnsubscribeToken(env, "garbage"), null);
  assert.equal(await verifyUnsubscribeToken({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") }, token), null);
  assert.equal(await signUnsubscribeToken({}, "user-1"), null);
});

test("the daily email leads with one block, links to the app and has no em dashes", () => {
  const blocks = [
    { subject: "Maths <Advanced>", time: "4:30 pm", minutes: 50 },
    { subject: "English", time: "6:00 pm", minutes: 40 },
  ];
  const mail = studyPlanEmail({ firstName: "Sam", blocks, appLink: "https://arcadiahq.app/app", unsubscribeUrl: "https://arcadiahq.app/api/email-reminders/unsubscribe?token=t" });
  assert.equal(mail.subject, "Your next block: Maths <Advanced> at 4:30 pm");
  assert.match(mail.html, /Start here/);
  assert.match(mail.html, /Maths &lt;Advanced&gt;/);
  assert.match(mail.html, /href="https:\/\/arcadiahq\.app\/app"/);
  assert.match(mail.html, /unsubscribe\?token=t/);
  assert.match(mail.text, /Hi Sam, your next study block is ready/);
  assert.ok(!/[—–]/.test(mail.html + mail.text));
  assert.equal(studyPlanEmail({ firstName: "", blocks: blocks.slice(0, 1), appLink: "a", unsubscribeUrl: "u" }).subject, "Your next block: Maths <Advanced> at 4:30 pm");
});

test("the weekly email uses honest stats and has no em dashes", () => {
  const mail = weeklySummaryEmail({
    firstName: "Sam",
    summary: { minutes: 135, sessions: 3, topSubject: "Maths <Advanced>", topSubjectMinutes: 80, nextWeekBlocks: 4 },
    appLink: "https://arcadiahq.app/app",
    unsubscribeUrl: "https://arcadiahq.app/api/email-reminders/unsubscribe?token=t",
  });
  assert.equal(mail.subject, "Your week in Arcadia: 2h 15m focused");
  assert.match(mail.html, /2h 15m/);
  assert.match(mail.html, /Maths &lt;Advanced&gt;/);
  assert.match(mail.text, /Next week already has 4 study blocks planned/);
  assert.ok(!/[—–]/.test(mail.html + mail.text));
});
