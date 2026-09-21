import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db, schema } from "../db";
import { newId, newToken, sha256Hex, timingSafeEqual } from "../lib/ids";
import { hashPassword, newSalt } from "../lib/password";
import { createSession, requireSession, SESSION_COOKIE } from "../lib/session";
import type { Env, Variables } from "../types";

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const cookie = "arcadia_google_auth";
const callback = (origin: string) => `${origin}/api/auth/google/callback`;
function options(origin: string) {
  return { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "Lax" as const, path: "/api/auth/google", maxAge: 600 };
}
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function failure(origin: string, reason: string) {
  return `${origin}/login?error=${encodeURIComponent(reason)}`;
}

auth.get("/start", async (c) => {
  if (!c.env.GOOGLE_AUTH_CLIENT_ID || !c.env.GOOGLE_AUTH_CLIENT_SECRET) return c.redirect(failure(c.env.APP_ORIGIN, "google_unavailable"));
  const state = newToken(24), nonce = newToken(24);
  const verifier = base64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  setCookie(c, cookie, JSON.stringify({ state, nonce, verifier }), options(c.env.APP_ORIGIN));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_AUTH_CLIENT_ID, redirect_uri: callback(c.env.APP_ORIGIN),
    response_type: "code", scope: "openid email profile", state, nonce,
    code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return c.redirect(url.toString());
});

auth.post("/link-start", requireSession, async (c) => {
  if (c.get("session").transport !== "cookie") return c.json({ error: "Open this in a browser session." }, 400);
  if (!c.env.GOOGLE_AUTH_CLIENT_ID || !c.env.GOOGLE_AUTH_CLIENT_SECRET) return c.json({ error: "Google sign-in is not configured." }, 503);
  const state = newToken(24), nonce = newToken(24);
  const verifier = base64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  setCookie(c, cookie, JSON.stringify({ state, nonce, verifier, linkUserId: c.get("session").userId }), options(c.env.APP_ORIGIN));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_AUTH_CLIENT_ID, redirect_uri: callback(c.env.APP_ORIGIN),
    response_type: "code", scope: "openid email profile", state, nonce,
    code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return c.json({ url: url.toString() });
});
auth.get("/callback", async (c) => {
  const raw = getCookie(c, cookie);
  deleteCookie(c, cookie, options(c.env.APP_ORIGIN));
  let stored: { state: string; nonce: string; verifier: string; linkUserId?: string };
  try { stored = JSON.parse(raw ?? ""); } catch { return c.redirect(failure(c.env.APP_ORIGIN, "google_state")); }
  const code = c.req.query("code") ?? "", state = c.req.query("state") ?? "";
  if (!code || !state || !stored?.state || !stored.nonce || !stored.verifier ||
    !timingSafeEqual(state, stored.state)) return c.redirect(failure(c.env.APP_ORIGIN, "google_state"));
  if (!c.env.GOOGLE_AUTH_CLIENT_ID || !c.env.GOOGLE_AUTH_CLIENT_SECRET) return c.redirect(failure(c.env.APP_ORIGIN, "google_unavailable"));
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_AUTH_CLIENT_ID, client_secret: c.env.GOOGLE_AUTH_CLIENT_SECRET,
        code, code_verifier: stored.verifier, redirect_uri: callback(c.env.APP_ORIGIN),
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok) return c.redirect(failure(c.env.APP_ORIGIN, "google_exchange"));
    const token = await response.json<{ id_token?: string }>();
    if (!token.id_token) return c.redirect(failure(c.env.APP_ORIGIN, "google_exchange"));
    const { payload } = await jwtVerify(token.id_token, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"], audience: c.env.GOOGLE_AUTH_CLIENT_ID,
    });
    if (!payload.sub || typeof payload.email !== "string" || payload.email_verified !== true ||
      !timingSafeEqual(String(payload.nonce ?? ""), stored.nonce)) return c.redirect(failure(c.env.APP_ORIGIN, "google_identity"));
    const email = payload.email.trim().toLowerCase();
    if (email.endsWith("@arcadia.local")) return c.redirect(failure(c.env.APP_ORIGIN, "google_identity"));
    const database = db(c.env.DB);
    const [linked] = await database.select().from(schema.authIdentities).where(and(eq(schema.authIdentities.provider, "google"), eq(schema.authIdentities.subject, payload.sub))).limit(1);
    let userId = linked?.userId;
    if (stored.linkUserId) {
      const rawSession = getCookie(c, SESSION_COOKIE);
      if (!rawSession) return c.redirect(failure(c.env.APP_ORIGIN, "google_link_required"));
      const [session] = await database.select().from(schema.sessions).where(eq(schema.sessions.id, await sha256Hex(rawSession))).limit(1);
      if (!session || session.expiresAt < Date.now() || session.userId !== stored.linkUserId ||
        (linked && linked.userId !== session.userId)) return c.redirect(failure(c.env.APP_ORIGIN, "google_link_required"));
      const [account] = await database.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
      if (!account || account.email !== email) return c.redirect(failure(c.env.APP_ORIGIN, "google_link_required"));
      userId = account.id;
      if (!linked) await database.insert(schema.authIdentities).values({ provider: "google", subject: payload.sub, userId });
      if (!account.emailVerified) await database.update(schema.users).set({ emailVerified: true, verificationToken: null, verificationExpiresAt: null }).where(eq(schema.users.id, userId));
    }
    if (!userId) {
      const [existing] = await database.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (existing) {
        // Google's claim for a third-party mailbox may be stale; avoid takeover of an existing account.
        if (!email.endsWith("@gmail.com") && payload.hd !== email.split("@")[1]) return c.redirect(failure(c.env.APP_ORIGIN, "google_link_required"));
        userId = existing.id;
        if (!existing.emailVerified) {
          // Whoever registered this address never proved they own it, so their
          // password must not survive Google proving the real owner.
          const salt = newSalt();
          await database.update(schema.users).set({
            emailVerified: true, verificationToken: null, verificationExpiresAt: null,
            passwordSalt: salt, passwordHash: await hashPassword(newToken(32), salt),
          }).where(eq(schema.users.id, userId));
          await database.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
          await database.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, userId));
        }
      } else {
        userId = newId("usr");
        const salt = newSalt(), name = String(payload.name ?? "").trim().slice(0, 120);
        await database.insert(schema.users).values({ id: userId, email, name, emailVerified: true, passwordSalt: salt, passwordHash: await hashPassword(newToken(32), salt) });
        await database.insert(schema.profiles).values({ userId, displayName: name || null, timezone: "Australia/Brisbane" });
        await database.insert(schema.companions).values({ userId });
      }
      await database.insert(schema.authIdentities).values({ provider: "google", subject: payload.sub, userId }).onConflictDoNothing();
    }
    await database.update(schema.users).set({ lastSignInAt: Date.now() }).where(eq(schema.users.id, userId));
    await createSession(c, userId);
    return c.redirect(`${c.env.APP_ORIGIN}/app`);
  } catch (error) {
    console.error("[google-auth]", error);
    return c.redirect(failure(c.env.APP_ORIGIN, "google_exchange"));
  }
});
export default auth;
