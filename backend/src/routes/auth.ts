import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { sendEmail, verificationEmail } from "../lib/email";
import { newId, newToken } from "../lib/ids";
import { hashPassword, newSalt, passwordProblem, verifyPassword } from "../lib/password";
import { createPendingReferral, createReferralCode, normaliseReferralCode } from "../lib/referrals";
import { createSession, destroySession } from "../lib/session";
import {
  appleRedirectUri,
  exchangeAppleCode,
  exchangeGoogleCode,
  googleRedirectUri,
  safeNext,
  signOAuthState,
  verifyGoogleIdToken,
  verifyOAuthState,
  type SocialIdentity,
} from "../lib/social-oauth";
import { DAY } from "../lib/time";
import type { Env, Variables } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

function googleSignInConfigured(env: Env): boolean {
  return (
    env.GOOGLE_SIGN_IN_ENABLED === "true" &&
    Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY)
  );
}

function nativeGoogleSignInConfigured(env: Env): boolean {
  return (
    env.GOOGLE_SIGN_IN_ENABLED === "true" &&
    Boolean(env.GOOGLE_CLIENT_ID && env.TOKEN_ENCRYPTION_KEY)
  );
}

function oauthErrorUrl(env: Env, returnTo: "/login" | "/register", reason: string): string {
  const url = new URL(returnTo, env.APP_ORIGIN);
  url.searchParams.set("oauth", reason);
  return url.toString();
}

async function finishSocialLogin(
  c: Parameters<typeof createSession>[0],
  identity: SocialIdentity,
  referralCode?: string | null,
): ReturnType<typeof createSession> {
  const database = db(c.env.DB);
  const [linked] = await database
    .select({ userId: schema.oauthAccounts.userId })
    .from(schema.oauthAccounts)
    .where(
      and(
        eq(schema.oauthAccounts.provider, identity.provider),
        eq(schema.oauthAccounts.providerUserId, identity.providerUserId),
      ),
    )
    .limit(1);

  let userId = linked?.userId;
  if (!userId) {
    const [existingUser] = await database
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, identity.email))
      .limit(1);

    userId = existingUser?.id;
    if (!userId) {
      userId = newId("usr");
      const stableReferralCode = await createReferralCode(database);
      const salt = newSalt();
      const passwordHash = await hashPassword(newToken(48), salt);
      await database.batch([
        database.insert(schema.users).values({
          id: userId,
          email: identity.email,
          passwordHash,
          passwordSalt: salt,
          name: identity.name,
          emailVerified: true,
          lastSignInAt: Date.now(),
          referralCode: stableReferralCode,
        }),
        database.insert(schema.profiles).values({
          userId,
          displayName: identity.name || null,
          timezone: "Australia/Brisbane",
        }),
        database.insert(schema.companions).values({ userId }),
        database.insert(schema.oauthAccounts).values({
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          userId,
        }),
      ]);
      await createPendingReferral(database, userId, referralCode);
    } else {
      await database.batch([
        database
          .update(schema.users)
          .set({ emailVerified: true, lastSignInAt: Date.now() })
          .where(eq(schema.users.id, userId)),
        database.insert(schema.oauthAccounts).values({
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          userId,
        }),
      ]);
    }
  } else {
    await database
      .update(schema.users)
      .set({ lastSignInAt: Date.now() })
      .where(eq(schema.users.id, userId));
  }

  return createSession(c, userId);
}

function socialReturnTo(value: string | undefined): "/login" | "/register" {
  return value === "register" ? "/register" : "/login";
}

auth.get("/oauth/config", (c) => {
  const nativeGoogle = nativeGoogleSignInConfigured(c.env);
  return c.json({
    google: googleSignInConfigured(c.env),
    nativeGoogle,
    // Google identifies this as the server client ID. It is public and is
    // required by the native SDK so its ID token has the backend audience.
    googleClientId: nativeGoogle ? c.env.GOOGLE_CLIENT_ID : null,
    apple: Boolean(
      c.env.APPLE_CLIENT_ID &&
        c.env.APPLE_TEAM_ID &&
        c.env.APPLE_KEY_ID &&
        c.env.APPLE_PRIVATE_KEY &&
        c.env.TOKEN_ENCRYPTION_KEY,
    ),
  });
});

auth.post("/oauth/google/native", async (c) => {
  if (!nativeGoogleSignInConfigured(c.env)) {
    return c.json({ error: "Google sign-in is not configured." }, 503);
  }

  const body = await c.req.json<{ idToken?: string; referralCode?: string }>().catch(() => null);
  const idToken = typeof body?.idToken === "string" ? body.idToken : "";
  if (!idToken || idToken.length > 8_192) {
    return c.json({ error: "Invalid Google sign-in response." }, 400);
  }

  try {
    const { csrfToken } = await finishSocialLogin(
      c,
      await verifyGoogleIdToken(c.env, idToken),
      normaliseReferralCode(body?.referralCode),
    );
    return c.json({ redirect: "/app", csrfToken });
  } catch (error) {
    console.error(
      "[oauth] Native Google sign-in failed",
      error instanceof Error ? error.message : error,
    );
    return c.json({ error: "Google sign-in could not be verified." }, 401);
  }
});

auth.get("/oauth/google", async (c) => {
  const returnTo = socialReturnTo(c.req.query("from"));
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!googleSignInConfigured(c.env) || !clientId) {
    return c.redirect(oauthErrorUrl(c.env, returnTo, "not_configured"));
  }
  const nonce = newToken(24);
  const state = await signOAuthState(c.env, {
    provider: "google",
    nonce,
    next: safeNext(c.req.query("next")),
    returnTo,
    referralCode: returnTo === "/register" ? normaliseReferralCode(c.req.query("ref")) : null,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri(c.env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("prompt", "select_account");
  return c.redirect(url.toString());
});

auth.get("/oauth/google/callback", async (c) => {
  const stateToken = c.req.query("state") ?? "";
  let returnTo: "/login" | "/register" = "/login";
  try {
    const state = await verifyOAuthState(c.env, stateToken, "google");
    returnTo = state.returnTo;
    if (c.req.query("error")) return c.redirect(oauthErrorUrl(c.env, returnTo, "cancelled"));
    const code = c.req.query("code");
    if (!code) return c.redirect(oauthErrorUrl(c.env, returnTo, "failed"));
    await finishSocialLogin(c, await exchangeGoogleCode(c.env, code), state.referralCode);
    return c.redirect(new URL(state.next, c.env.APP_ORIGIN).toString());
  } catch (error) {
    console.error("[oauth] Google sign-in failed", error instanceof Error ? error.message : error);
    return c.redirect(oauthErrorUrl(c.env, returnTo, "failed"));
  }
});

auth.get("/oauth/apple", async (c) => {
  const returnTo = socialReturnTo(c.req.query("from"));
  if (
    !c.env.APPLE_CLIENT_ID ||
    !c.env.APPLE_TEAM_ID ||
    !c.env.APPLE_KEY_ID ||
    !c.env.APPLE_PRIVATE_KEY ||
    !c.env.TOKEN_ENCRYPTION_KEY
  ) {
    return c.redirect(oauthErrorUrl(c.env, returnTo, "not_configured"));
  }
  const nonce = newToken(24);
  const state = await signOAuthState(c.env, {
    provider: "apple",
    nonce,
    next: safeNext(c.req.query("next")),
    returnTo,
    referralCode: returnTo === "/register" ? normaliseReferralCode(c.req.query("ref")) : null,
  });
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", c.env.APPLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", appleRedirectUri(c.env));
  url.searchParams.set("response_type", "code id_token");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return c.redirect(url.toString());
});

auth.post("/oauth/apple/callback", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const stateToken = String(form?.get("state") ?? "");
  let returnTo: "/login" | "/register" = "/login";
  try {
    const state = await verifyOAuthState(c.env, stateToken, "apple");
    returnTo = state.returnTo;
    if (form?.get("error")) return c.redirect(oauthErrorUrl(c.env, returnTo, "cancelled"), 303);
    const code = String(form?.get("code") ?? "");
    if (!code) return c.redirect(oauthErrorUrl(c.env, returnTo, "failed"), 303);

    let suppliedName = "";
    const rawUser = form?.get("user");
    if (typeof rawUser === "string") {
      try {
        const user = JSON.parse(rawUser) as { name?: { firstName?: string; lastName?: string } };
        suppliedName = [user.name?.firstName, user.name?.lastName].filter(Boolean).join(" ");
      } catch {
        // Apple only supplies this optional JSON on the first authorization.
      }
    }
    await finishSocialLogin(c, await exchangeAppleCode(c.env, code, state.nonce, suppliedName), state.referralCode);
    return c.redirect(new URL(state.next, c.env.APP_ORIGIN).toString(), 303);
  } catch (error) {
    console.error("[oauth] Apple sign-in failed", error instanceof Error ? error.message : error);
    return c.redirect(oauthErrorUrl(c.env, returnTo, "failed"), 303);
  }
});

auth.post("/register", async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; password?: string; referralCode?: string }>().catch(
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
  const referralCode = await createReferralCode(database);
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
    referralCode,
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

  await createPendingReferral(database, userId, body.referralCode);

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
