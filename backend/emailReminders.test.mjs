import test from "node:test";
import assert from "node:assert/strict";
import { formatBlockTime, inSendWindow, lastActiveAt, skipReason } from "./src/lib/email-reminder-rules.ts";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./src/lib/email-unsubscribe.ts";
import { studyPlanEmail } from "./src/lib/email.ts";

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

test("the email lists blocks, links to the app and has no em dashes", () => {
  const blocks = [
    { subject: "Maths <Advanced>", time: "4:30 pm", minutes: 50 },
    { subject: "English", time: "6:00 pm", minutes: 40 },
  ];
  const mail = studyPlanEmail({ firstName: "Sam", blocks, appLink: "https://arcadiahq.app/app", unsubscribeUrl: "https://arcadiahq.app/api/email-reminders/unsubscribe?token=t" });
  assert.equal(mail.subject, "Your plan for today: 2 sessions");
  assert.match(mail.html, /Start your first session/);
  assert.match(mail.html, /Maths &lt;Advanced&gt;/);
  assert.match(mail.html, /href="https:\/\/arcadiahq\.app\/app"/);
  assert.match(mail.html, /unsubscribe\?token=t/);
  assert.match(mail.text, /Hi Sam, here is/);
  assert.ok(!/[—–]/.test(mail.html + mail.text));
  assert.equal(studyPlanEmail({ firstName: "", blocks: blocks.slice(0, 1), appLink: "a", unsubscribeUrl: "u" }).subject, "Your plan for today: 1 session");
});
