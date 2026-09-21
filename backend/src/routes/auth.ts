import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { resetPasswordEmail, sendEmail, verificationEmail } from "../lib/email";
import { newId, newToken, sha256Hex } from "../lib/ids";
import { hashPassword, newSalt, passwordProblem, verifyPassword } from "../lib/password";
import { throttle } from "../lib/rate-limit";
import { createSession, destroySession } from "../lib/session";
import { DAY } from "../lib/time";
import type { Env, Variables } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const auth = new Hono<{ Bindings: Env; Variables: Variables }>();
const genericVerification = { message: "If that account needs verifying, we've sent a fresh link." };
const genericReset = { message: "If that address has an account, we've sent a password reset link." };
function emailOf(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function validEmail(value: string) { return EMAIL_PATTERN.test(value) && value.length <= 254 && !value.endsWith("@arcadia.local"); }
function devTokens(env: Env) { return env.DEV_AUTH_TOKENS === "true" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.APP_ORIGIN); }
function tokenResponse(env: Env, token: string) { return devTokens(env) ? { verificationToken: token } : {}; }

auth.post("/register", async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; password?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const name = String(body.name ?? "").trim().slice(0, 120);
  const email = emailOf(body.email);
  const password = String(body.password ?? "");
  if (!validEmail(email)) return c.json({ error: "Please enter a valid email address." }, 422);
  const problem = passwordProblem(password);
  if (problem) return c.json({ error: problem }, 422);
  const limited = await throttle(c, "register", email);
  if (limited) return limited;
  if (!c.env.RESEND_API_KEY && !devTokens(c.env)) return c.json({ error: "Registration is temporarily unavailable. Please try again later." }, 503);
  const database = db(c.env.DB);
  const [existing] = await database.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) return c.json({ message: "Check your email to confirm your account." });
  const salt = newSalt();
  const userId = newId("usr");
  const verificationToken = newToken(24);
  await database.insert(schema.users).values({
    id: userId, email, name, passwordSalt: salt, passwordHash: await hashPassword(password, salt),
    verificationToken: await sha256Hex(verificationToken), verificationExpiresAt: Date.now() + DAY,
  });
  await database.insert(schema.profiles).values({ userId, displayName: name || null, timezone: "Australia/Brisbane" });
  await database.insert(schema.companions).values({ userId });
  const link = `${c.env.APP_ORIGIN}/register?token=${encodeURIComponent(verificationToken)}`;
  const sent = await sendEmail(c.env, { to: email, ...verificationEmail(link) });
  if (!sent && !devTokens(c.env)) return c.json({ error: "We could not send your verification email. Please use resend verification shortly." }, 503);
  return c.json({ message: "Check your email to confirm your account.", ...tokenResponse(c.env, verificationToken) });
});

auth.get("/verify", async (c) => {
  const token = c.req.query("token") ?? "";
  if (!/^[a-f0-9]{48}$/.test(token)) return c.json({ error: "This link is not valid." }, 400);
  const database = db(c.env.DB);
  const digest = await sha256Hex(token);
  // Accept a legacy plaintext link until its original 24-hour expiry.
  let [user] = await database.select().from(schema.users).where(eq(schema.users.verificationToken, digest)).limit(1);
  if (!user) [user] = await database.select().from(schema.users).where(eq(schema.users.verificationToken, token)).limit(1);
  if (!user) return c.json({ error: "This link is not valid." }, 400);
  if (user.emailVerified) return c.json({ ok: true, alreadyVerified: true });
  if ((user.verificationExpiresAt ?? 0) < Date.now()) return c.json({ error: "This link has expired.", expired: true }, 410);
  await database.update(schema.users).set({ emailVerified: true, verificationToken: digest, verificationExpiresAt: null }).where(eq(schema.users.id, user.id));
  return c.json({ ok: true });
});

auth.post("/resend-verification", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const email = emailOf(body.email);
  if (!validEmail(email)) return c.json({ error: "Please enter a valid email address." }, 422);
  const limited = await throttle(c, "resend", email);
  if (limited) return limited;
  const database = db(c.env.DB);
  const [user] = await database.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || user.emailVerified) return c.json(genericVerification);
  if (!c.env.RESEND_API_KEY && !devTokens(c.env)) return c.json({ error: "Email delivery is temporarily unavailable." }, 503);
  const token = newToken(24);
  await database.update(schema.users).set({ verificationToken: await sha256Hex(token), verificationExpiresAt: Date.now() + DAY }).where(eq(schema.users.id, user.id));
  const link = `${c.env.APP_ORIGIN}/register?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail(c.env, { to: email, ...verificationEmail(link) });
  if (!sent && !devTokens(c.env)) return c.json({ error: "Email delivery is temporarily unavailable." }, 503);
  return c.json({ ...genericVerification, ...tokenResponse(c.env, token) });
});

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; transport?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const email = emailOf(body.email);
  const password = String(body.password ?? "");
  if (password.length > 200) return c.json({ error: "Email or password is incorrect." }, 401);
  const limited = await throttle(c, "login", email || undefined);
  if (limited) return limited;
  const database = db(c.env.DB);
  const [user] = await database.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const rejection = { error: "Email or password is incorrect." };
  if (!user) { await hashPassword(password, "decoy-salt-value"); return c.json(rejection, 401); }
  if (!await verifyPassword(password, user.passwordSalt, user.passwordHash)) return c.json(rejection, 401);
  if (!user.emailVerified) return c.json({ error: "Confirm your email address first.", needsVerification: true }, 403);
  await database.update(schema.users).set({ lastSignInAt: Date.now() }).where(eq(schema.users.id, user.id));
  const session = await createSession(c, user.id, body.transport === "bearer" ? "bearer" : "cookie");
  return c.json({ redirect: "/app", ...session });
});

auth.post("/forgot-password", async (c) => {
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const email = emailOf(body.email);
  if (!validEmail(email)) return c.json({ error: "Please enter a valid email address." }, 422);
  const limited = await throttle(c, "forgot", email);
  if (limited) return limited;
  const database = db(c.env.DB);
  const [user] = await database.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (user && c.env.RESEND_API_KEY) {
    const token = newToken(32);
    await database.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, user.id));
    await database.insert(schema.passwordResetTokens).values({ id: await sha256Hex(token), userId: user.id, expiresAt: Date.now() + 30 * 60_000 });
    const link = `${c.env.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail(c.env, { to: email, ...resetPasswordEmail(link) });
    return c.json({ ...genericReset, ...(devTokens(c.env) ? { resetToken: token } : {}) });
  }
  if (user && devTokens(c.env)) {
    const token = newToken(32);
    await database.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, user.id));
    await database.insert(schema.passwordResetTokens).values({ id: await sha256Hex(token), userId: user.id, expiresAt: Date.now() + 30 * 60_000 });
    return c.json({ ...genericReset, resetToken: token });
  }
  return c.json(genericReset);
});

auth.post("/reset-password", async (c) => {
  const body = await c.req.json<{ token?: string; password?: string; transport?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!/^[a-f0-9]{64}$/.test(token)) return c.json({ error: "This reset link is invalid or has expired." }, 400);
  const problem = passwordProblem(password);
  if (problem) return c.json({ error: problem }, 422);
  const limited = await throttle(c, "reset", await sha256Hex(token));
  if (limited) return limited;
  const database = db(c.env.DB);
  const digest = await sha256Hex(token);
  const [reset] = await database.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.id, digest)).returning();
  if (!reset || reset.expiresAt < Date.now()) return c.json({ error: "This reset link is invalid or has expired.", expired: true }, 410);
  const salt = newSalt();
  await database.update(schema.users).set({ passwordSalt: salt, passwordHash: await hashPassword(password, salt), emailVerified: true }).where(eq(schema.users.id, reset.userId));
  await database.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, reset.userId));
  await database.delete(schema.sessions).where(eq(schema.sessions.userId, reset.userId));
  const session = await createSession(c, reset.userId, body.transport === "bearer" ? "bearer" : "cookie");
  return c.json({ ok: true, redirect: "/app", ...session });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

export default auth;
