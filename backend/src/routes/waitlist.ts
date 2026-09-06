import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { sendEmail } from "../lib/email";
import { newId } from "../lib/ids";
import type { Env, Variables } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const waitlist = new Hono<{ Bindings: Env; Variables: Variables }>();

// Public: the landing page posts here with no session.
waitlist.post("/", async (c) => {
  const body = await c.req.json<{ email?: unknown; source?: unknown }>().catch(() => null);
  if (!body) return c.json({ message: "Invalid request." }, 400);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return c.json({ message: "Please enter a valid email address." }, 422);
  }

  const database = db(c.env.DB);
  const [existing] = await database
    .select({ id: schema.waitlist.id })
    .from(schema.waitlist)
    .where(eq(schema.waitlist.email, email))
    .limit(1);

  if (!existing) {
    await database.insert(schema.waitlist).values({
      id: newId("wl"),
      email,
      source: typeof body.source === "string" ? body.source.slice(0, 64) : "arcadia-landing",
    });

    await sendEmail(c.env, {
      to: email,
      subject: "You're on the Arcadia list",
      text: "Thanks for signing up. We'll email you when early access opens.",
      html: "<p>Thanks for signing up. We'll email you when early access opens.</p>",
    });
  }

  // Same response either way, so the list cannot be probed for members.
  return c.json({ ok: true });
});

export default waitlist;
