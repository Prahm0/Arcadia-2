import { and, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { resetPasswordEmail, sendEmail, verificationEmail } from "../lib/email";
import { newId, newToken, sha256Hex } from "../lib/ids";
import { hashPassword, newSalt, passwordProblem, verifyPassword } from "../lib/password";
import { encryptToken } from "../lib/crypto";
import { createPendingReferral, createReferralCode, normaliseReferralCode } from "../lib/referrals";
import { createSession, destroySession } from "../lib/session";
import {
  appleRedirectUri,
  exchangeNativeAppleCode,
  exchangeAppleCode,
  exchangeGoogleCode,
  googleRedirectUri,
  safeNext,
  signNativeAppleNonce,
  verifyNativeAppleIdentity,
  signOAuthState,
  verifyGoogleIdToken,
  verifyOAuthState,
  type SocialIdentity,
} from "../lib/social-oauth";
import { DAY } from "../lib/time";
import type { Env, Variables } from "../types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_TTL = 60 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN = 60 * 1000;
const PASSWORD_RESET_OK = { message: "If an account exists, we've emailed a reset link." };
const PASSWORD_RESET_EXPIRED = { error: "This reset link has expired. Request a new one." };

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

  let userId: string | undefined = linked?.userId;
  if (!userId) {
    const existingUser = identity.email
      ? (await database.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, identity.email)).limit(1))[0]
      : undefined;

    userId = existingUser?.id;
    if (!userId) {
      const email = identity.email;
      if (!email) throw new Error("Apple did not return an email for a new account.");
      userId = newId("usr");
      const stableReferralCode = await createReferralCode(database);
      const salt = newSalt();
      const passwordHash = await hashPassword(newToken(48), salt);
      await database.batch([
        database.insert(schema.users).values({
          id: userId,
          email,
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
    nativeApple: Boolean(c.env.APPLE_TEAM_ID && c.env.APPLE_KEY_ID && c.env.APPLE_PRIVATE_KEY && c.env.APPLE_BUNDLE_ID && c.env.TOKEN_ENCRYPTION_KEY),
  });
});

auth.get("/oauth/apple/native/nonce", async (c) => {
  if (!(c.env.APPLE_TEAM_ID && c.env.APPLE_KEY_ID && c.env.APPLE_PRIVATE_KEY && c.env.APPLE_BUNDLE_ID && c.env.TOKEN_ENCRYPTION_KEY)) {
    return c.json({ error: "Apple sign-in is not configured." }, 503);
  }
  const rawNonce = newToken(24);
  return c.json({ nonceToken: await signNativeAppleNonce(c.env, rawNonce), hashedNonce: await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce)).then((digest) => [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")) });
});

auth.post("/oauth/apple/native", async (c) => {
  if (!(c.env.APPLE_TEAM_ID && c.env.APPLE_KEY_ID && c.env.APPLE_PRIVATE_KEY && c.env.APPLE_BUNDLE_ID && c.env.TOKEN_ENCRYPTION_KEY)) return c.json({ error: "Apple sign-in is not configured." }, 503);
  const body = await c.req.json<{ identityToken?: string; authorizationCode?: string; nonceToken?: string; givenName?: string; familyName?: string; referralCode?: string }>().catch(() => null);
  if (!body?.identityToken || !body.nonceToken || body.identityToken.length > 8192) return c.json({ error: "Invalid Apple sign-in response." }, 400);
  try {
    const identity = await verifyNativeAppleIdentity(c.env, body.identityToken, body.nonceToken);
    identity.name = [body.givenName, body.familyName].filter((value): value is string => typeof value === "string").join(" ").trim().slice(0, 120);
    const { csrfToken } = await finishSocialLogin(c, identity, normaliseReferralCode(body.referralCode));
    if (body.authorizationCode) {
      try {
        const refreshToken = await exchangeNativeAppleCode(c.env, body.authorizationCode);
        if (refreshToken) await db(c.env.DB).update(schema.oauthAccounts).set({ refreshTokenEncrypted: await encryptToken(refreshToken, c.env.TOKEN_ENCRYPTION_KEY!), clientId: c.env.APPLE_BUNDLE_ID }).where(and(eq(schema.oauthAccounts.provider, "apple"), eq(schema.oauthAccounts.providerUserId, identity.providerUserId)));
      } catch (error) { console.error("[oauth] Apple token exchange failed", error instanceof Error ? error.message : error); }
    }
    return c.json({ redirect: "/app", csrfToken });
  } catch (error) {
    console.error("[oauth] Native Apple sign-in failed", error instanceof Error ? error.message : error);
    return c.json({ error: "Apple sign-in could not be verified." }, 401);
  }
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

auth.post("/forgot-password", async (c) => {
  // This endpoint intentionally has one response for every outcome. It means
  // someone cannot use it to discover who has an Arcadia account.
  const body = await c.req.json<{ email?: string }>().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    // Keep invalid and unknown addresses from being conspicuously faster than
    // an account lookup and reset-mail request.
    await hashPassword("password-reset", "password-reset-decoy");
    return c.json(PASSWORD_RESET_OK);
  }

  const database = db(c.env.DB);
  const [user] = await database
    .select({
      id: schema.users.id,
      email: schema.users.email,
      passwordResetRequestedAt: schema.users.passwordResetRequestedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const now = Date.now();
  const recentlyRequested = (user?.passwordResetRequestedAt ?? 0) > now - PASSWORD_RESET_COOLDOWN;
  if (!user || user.email.endsWith("@arcadia.local") || recentlyRequested) {
    await hashPassword("password-reset", "password-reset-decoy");
    return c.json(PASSWORD_RESET_OK);
  }

  const token = newToken(32);
  const tokenHash = await sha256Hex(token);
  await database
    .update(schema.users)
    .set({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: now + PASSWORD_RESET_TTL,
      passwordResetRequestedAt: now,
    })
    .where(eq(schema.users.id, user.id));

  const link = `${c.env.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  // Do not expose mail-provider failures, account state, or a reset token to
  // the caller. The generic success copy remains the same in all cases.
  await sendEmail(c.env, { to: user.email, ...resetPasswordEmail(link) });
  return c.json(PASSWORD_RESET_OK);
});

auth.post("/reset-password", async (c) => {
  const body = await c.req.json<{ token?: string; password?: string }>().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token || token.length > 512) return c.json(PASSWORD_RESET_EXPIRED, 400);

  const database = db(c.env.DB);
  const tokenHash = await sha256Hex(token);
  const [user] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.passwordResetTokenHash, tokenHash),
        gte(schema.users.passwordResetExpiresAt, Date.now()),
      ),
    )
    .limit(1);

  if (!user) return c.json(PASSWORD_RESET_EXPIRED, 400);

  const problem = passwordProblem(password);
  if (problem) return c.json({ error: problem }, 422);

  const salt = newSalt();
  const passwordHash = await hashPassword(password, salt);
  // Include the still-valid hash in the write predicate, not just the read
  // above. That makes consuming a token atomic: a second tab or concurrent
  // request cannot also use the same link.
  const [updated] = await database
    .update(schema.users)
    .set({
      passwordHash,
      passwordSalt: salt,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      passwordResetRequestedAt: null,
      emailVerified: true,
      lastSignInAt: Date.now(),
    })
    .where(
      and(
        eq(schema.users.id, user.id),
        eq(schema.users.passwordResetTokenHash, tokenHash),
        gte(schema.users.passwordResetExpiresAt, Date.now()),
      ),
    )
    .returning({ id: schema.users.id });

  if (!updated) return c.json(PASSWORD_RESET_EXPIRED, 400);

  await database.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));

  const { csrfToken } = await createSession(c, user.id);
  return c.json({ redirect: "/app", csrfToken });
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
