import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { sendPlanEmailNow } from "../lib/email-reminders";
import { verifyUnsubscribeToken } from "../lib/email-unsubscribe";
import type { Env, Variables } from "../types";

const emailReminders = new Hono<{ Bindings: Env; Variables: Variables }>();

async function turnOff(env: Env, token: string): Promise<boolean> {
  const userId = await verifyUnsubscribeToken(env, token);
  if (!userId) return false;
  await db(env.DB).update(schema.profiles).set({ emailRemindersEnabled: false }).where(eq(schema.profiles.userId, userId));
  return true;
}

function page(env: Env, heading: string, message: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>${heading}</title></head>
<body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
<main style="max-width:440px;margin:15vh auto;padding:32px;background:#ffffff;border:1px solid #ececf1;border-radius:14px;">
<h1 style="margin:0 0 12px;font-size:22px;">${heading}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#3a3a4a;">${message}</p>
<a href="${env.APP_ORIGIN}/app" style="color:#7c5cff;text-decoration:none;font-weight:600;">Open Arcadia</a>
</main></body></html>`;
}

/**
 * Public, no session: the signed token in the link is the credential (see
 * lib/email-unsubscribe.ts). GET is the link in the email body and POST is
 * the RFC 8058 one-click call mail clients make for List-Unsubscribe-Post.
 */
emailReminders.get("/unsubscribe", async (c) => {
  const ok = await turnOff(c.env, c.req.query("token") ?? "");
  if (!ok) {
    return c.html(page(c.env, "This link doesn't work", "It may be incomplete. You can switch daily plan emails off any time under Settings in Arcadia."), 400);
  }
  return c.html(page(c.env, "You are unsubscribed", "No more daily plan emails. You can turn them back on any time under Settings in Arcadia."));
});

emailReminders.post("/unsubscribe", async (c) => {
  const ok = await turnOff(c.env, c.req.query("token") ?? "");
  return ok ? c.json({ ok: true }) : c.json({ error: "Invalid link." }, 400);
});

/**
 * Developer accounts only: sends today's plan email to yourself right now,
 * ignoring the 4pm window, the once-a-day limit and the activity rules. If
 * mail isn't configured (no RESEND_API_KEY) the HTML comes back to preview.
 */
emailReminders.post("/test", async (c) => {
  const { userId } = c.get("session");
  const [user] = await db(c.env.DB)
    .select({ developerAccess: schema.users.developerAccess })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user?.developerAccess) return c.json({ error: "Not available." }, 403);

  const result = await sendPlanEmailNow(c.env, userId);
  if (result.status === "no_blocks") return c.json({ error: "No study blocks left to do today, so there is nothing to send." }, 422);
  if (result.status === "no_signing_key") return c.json({ error: "TOKEN_ENCRYPTION_KEY is not set." }, 503);
  return c.json(result);
});

export default emailReminders;
