import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { hashPassword, newSalt, passwordProblem, verifyPassword } from "../lib/password";
import { iso } from "../lib/time";
import { clearSessionCookie } from "../lib/session";
import type { Env, Variables } from "../types";

const account = new Hono<{ Bindings: Env; Variables: Variables }>();

account.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);

  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);

  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);

  const [googleIdentity] = await database.select({ subject: schema.authIdentities.subject }).from(schema.authIdentities).where(eq(schema.authIdentities.userId, userId)).limit(1);

  return c.json({
    account: {
      email: user.email,
      googleSignInLinked: Boolean(googleIdentity),
      displayName: profile?.displayName || user.name,
      theme: user.theme,
      createdAt: iso(user.createdAt),
      lastSignInAt: user.lastSignInAt ? iso(user.lastSignInAt) : undefined,
    },
  });
});

account.patch("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ name?: string; theme?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 120);
    if (!name) return c.json({ error: "Name cannot be empty." }, 422);
    await database.update(schema.users).set({ name }).where(eq(schema.users.id, userId));
    await database
      .update(schema.profiles)
      .set({ displayName: name })
      .where(eq(schema.profiles.userId, userId));
  }

  if (typeof body.theme === "string") {
    const theme = body.theme.trim().slice(0, 32);
    if (!["system", "light", "dark"].includes(theme)) {
      return c.json({ error: "Unknown theme." }, 422);
    }
    await database.update(schema.users).set({ theme }).where(eq(schema.users.id, userId));
  }

  return c.json({ ok: true });
});

account.post("/change-password", async (c) => {
  const { userId, sessionId } = c.get("session");
  const body = await c.req
    .json<{ currentPassword?: string; newPassword?: string }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const problem = passwordProblem(String(body.newPassword ?? ""));
  if (problem) return c.json({ error: problem }, 422);

  const database = db(c.env.DB);
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);

  const ok = await verifyPassword(
    String(body.currentPassword ?? ""),
    user.passwordSalt,
    user.passwordHash,
  );
  if (!ok) return c.json({ error: "Current password is incorrect." }, 403);

  const salt = newSalt();
  const passwordHash = await hashPassword(String(body.newPassword), salt);
  await database
    .update(schema.users)
    .set({ passwordHash, passwordSalt: salt })
    .where(eq(schema.users.id, userId));

  // Sign out every other device; keep this one.
  const sessions = await database
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId));
  for (const session of sessions) {
    if (session.id !== sessionId) {
      await database.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
    }
  }

  return c.json({ ok: true });
});


account.delete("/", async (c) => {
  const { userId, sessionId } = c.get("session");
  const body = await c.req.json<{ confirmation?: string }>().catch(() => null);
  if (body?.confirmation !== "DELETE") return c.json({ error: "Type DELETE to confirm." }, 422);
  const database = db(c.env.DB);
  const [session] = await database.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).limit(1);
  if (!session || Date.now() - session.createdAt > 15 * 60_000) {
    return c.json({ error: "Sign out and sign back in before deleting your account." }, 403);
  }
  const [user] = await database.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);
  // Enumerate the entire user prefix, including orphaned R2 objects not referenced by D1.
  if (c.env.UPLOADS) {
    let cursor: string | undefined;
    do {
      const page = await c.env.UPLOADS.list({ prefix: `${userId}/`, cursor });
      if (page.objects.length) await c.env.UPLOADS.delete(page.objects.map((object) => object.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  } else {
    const [upload] = await database.select().from(schema.uploads).where(eq(schema.uploads.userId, userId)).limit(1);
    if (upload) return c.json({ error: "Uploads are temporarily unavailable. Contact support to delete your account." }, 503);
  }
  await database.delete(schema.waitlist).where(eq(schema.waitlist.email, user.email));
  await database.delete(schema.users).where(eq(schema.users.id, userId));
  clearSessionCookie(c);
  return c.json({ ok: true });
});

export default account;
