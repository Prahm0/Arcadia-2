import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { sendEmail, verificationEmail } from "../lib/email";
import { newId, newToken } from "../lib/ids";
import { hashPassword, newSalt, passwordProblem, verifyPassword } from "../lib/password";
import { createSession, destroySession } from "../lib/session";
import { DAY } from "../lib/time";
import type { Env, Variables } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

auth.post("/register", async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; password?: string }>().catch(
    () => null,
  );
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const name = String(body.name ?? "").trim().slice(0, 120);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return c.json({ error: "Please enter a valid email address." }, 422);
  }
  const problem = passwordProblem(password);
  if (problem) return c.json({ error: problem }, 422);

  const database = db(c.env.DB);
  const [existing] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  // Do not reveal whether an address is already registered.
  if (existing) {
    return c.json({ message: "Check your email to confirm your account." });
  }

  // Guest accounts use the reserved @arcadia.local suffix. There's no real
  // inbox behind them, so we mark them verified on the spot and skip the
  // mail send — otherwise "Continue as guest" fails to sign in with our
  // usual "confirm your email first" gate.
  const isGuest = email.endsWith("@arcadia.local");

  const salt = newSalt();
  const passwordHash = await hashPassword(password, salt);
  const userId = newId("usr");
  const verificationToken = isGuest ? null : newToken(24);

  await database.insert(schema.users).values({
    id: userId,
    email,
    passwordHash,
    passwordSalt: salt,
    name,
    emailVerified: isGuest,
    verificationToken,
    verificationExpiresAt: isGuest ? null : Date.now() + DAY,
  });

  await database.insert(schema.profiles).values({
    userId,
    displayName: name || null,
    timezone: "Australia/Brisbane",
  });
  await database.insert(schema.companions).values({ userId });

  if (isGuest) {
    return c.json({ message: "Guest account ready." });
  }

  const link = `${c.env.APP_ORIGIN}/register?token=${encodeURIComponent(verificationToken!)}`;
  const sent = await sendEmail(c.env, { to: email, ...verificationEmail(link) });

  // With no mail provider configured the register page finishes the flow
  // itself using verificationToken, which keeps local dev usable.
  return c.json(
    sent
      ? { message: "Check your email to confirm your account." }
      : { message: "Account created.", verificationToken },
  );
});

auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Missing token." }, 400);

  const database = db(c.env.DB);
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.verificationToken, token))
    .limit(1);

  if (!user) return c.json({ error: "This link is not valid." }, 400);
  if ((user.verificationExpiresAt ?? 0) < Date.now()) {
    return c.json({ error: "This link has expired." }, 400);
  }

  await database
    .update(schema.users)
    .set({ emailVerified: true, verificationToken: null, verificationExpiresAt: null })
    .where(eq(schema.users.id, user.id));

  return c.json({ ok: true });
});

auth.post("/resend-verification", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return c.json({ error: "Please enter a valid email address." }, 422);
  }

  const database = db(c.env.DB);
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  // Same response either way so the endpoint can't enumerate accounts and
  // can't reveal that an existing account is already verified.
  const genericOk = { message: "If that account needs verifying, we've sent a fresh link." };

  if (!user || user.emailVerified) return c.json(genericOk);

  const verificationToken = newToken(24);
  await database
    .update(schema.users)
    .set({ verificationToken, verificationExpiresAt: Date.now() + DAY })
    .where(eq(schema.users.id, user.id));

  const link = `${c.env.APP_ORIGIN}/register?token=${encodeURIComponent(verificationToken)}`;
  await sendEmail(c.env, { to: email, ...verificationEmail(link) });

  return c.json(genericOk);
});

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const database = db(c.env.DB);
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  // Same message either way, so this cannot be used to enumerate accounts.
  const rejection = { error: "Email or password is incorrect." };
  if (!user) {
    // Spend comparable time so timing does not leak existence.
    await hashPassword(password, "decoy-salt-value");
    return c.json(rejection, 401);
  }

  const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!ok) return c.json(rejection, 401);

  if (!user.emailVerified) {
    // Signal on the response so the login page can offer a "resend link"
    // button, instead of leaving the user staring at a dead-end message.
    return c.json(
      { error: "Confirm your email address first.", needsVerification: true },
      403,
    );
  }

  await database
    .update(schema.users)
    .set({ lastSignInAt: Date.now() })
    .where(eq(schema.users.id, user.id));

  const { csrfToken } = await createSession(c, user.id);
  return c.json({ redirect: "/app", csrfToken });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

export default auth;
