import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";
import type { Env } from "../types";

export type OAuthProvider = "google" | "apple";

export interface OAuthState {
  provider: OAuthProvider;
  nonce: string;
  next: string;
  returnTo: "/login" | "/register";
}

export interface SocialIdentity {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  name: string;
}

const encoder = new TextEncoder();
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function stateKey(env: Env): Uint8Array {
  if (!env.TOKEN_ENCRYPTION_KEY) throw new Error("OAuth state signing is not configured.");
  return encoder.encode(env.TOKEN_ENCRYPTION_KEY);
}

export function safeNext(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  const base = new URL("https://arcadia.invalid");
  const parsed = new URL(value, base);
  if (parsed.origin !== base.origin) return "/app";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export async function signOAuthState(env: Env, state: OAuthState): Promise<string> {
  return new SignJWT({
    provider: state.provider,
    nonce: state.nonce,
    next: safeNext(state.next),
    returnTo: state.returnTo,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setAudience("arcadia-oauth")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(stateKey(env));
}

export async function verifyOAuthState(
  env: Env,
  token: string,
  expectedProvider: OAuthProvider,
): Promise<OAuthState> {
  const { payload } = await jwtVerify(token, stateKey(env), {
    algorithms: ["HS256"],
    audience: "arcadia-oauth",
  });
  if (
    payload.provider !== expectedProvider ||
    typeof payload.nonce !== "string" ||
    typeof payload.next !== "string" ||
    (payload.returnTo !== "/login" && payload.returnTo !== "/register")
  ) {
    throw new Error("Invalid OAuth state.");
  }
  return {
    provider: expectedProvider,
    nonce: payload.nonce,
    next: safeNext(payload.next),
    returnTo: payload.returnTo,
  };
}

export function googleRedirectUri(env: Env): string {
  return `${env.APP_ORIGIN}/api/auth/oauth/google/callback`;
}

export async function exchangeGoogleCode(env: Env, code: string): Promise<SocialIdentity> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google sign-in is not configured.");
  }
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(env),
      grant_type: "authorization_code",
    }),
  });
  const token: Record<string, unknown> = await tokenResponse
    .json<Record<string, unknown>>()
    .catch(() => ({}));
  if (!tokenResponse.ok || typeof token.access_token !== "string") {
    throw new Error("Google token exchange failed.");
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const profile: Record<string, unknown> = await profileResponse
    .json<Record<string, unknown>>()
    .catch(() => ({}));
  if (
    !profileResponse.ok ||
    typeof profile.sub !== "string" ||
    typeof profile.email !== "string" ||
    profile.email_verified !== true
  ) {
    throw new Error("Google did not return a verified email address.");
  }
  return {
    provider: "google",
    providerUserId: profile.sub,
    email: profile.email.trim().toLowerCase(),
    name: typeof profile.name === "string" ? profile.name.trim().slice(0, 120) : "",
  };
}

export function appleRedirectUri(env: Env): string {
  return `${env.APP_ORIGIN}/api/auth/oauth/apple/callback`;
}

async function appleClientSecret(env: Env): Promise<string> {
  if (!env.APPLE_CLIENT_ID || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) {
    throw new Error("Apple sign-in is not configured.");
  }
  const privateKey = await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

export async function exchangeAppleCode(
  env: Env,
  code: string,
  expectedNonce: string,
  suppliedName: string,
): Promise<SocialIdentity> {
  if (!env.APPLE_CLIENT_ID) throw new Error("Apple sign-in is not configured.");
  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.APPLE_CLIENT_ID,
      client_secret: await appleClientSecret(env),
      redirect_uri: appleRedirectUri(env),
      grant_type: "authorization_code",
    }),
  });
  const token: Record<string, unknown> = await tokenResponse
    .json<Record<string, unknown>>()
    .catch(() => ({}));
  if (!tokenResponse.ok || typeof token.id_token !== "string") {
    throw new Error("Apple token exchange failed.");
  }
  const { payload } = await jwtVerify(token.id_token, APPLE_KEYS, {
    algorithms: ["RS256"],
    issuer: APPLE_ISSUER,
    audience: env.APPLE_CLIENT_ID,
  });
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    payload.nonce !== expectedNonce ||
    !verified
  ) {
    throw new Error("Apple did not return a valid identity.");
  }
  return {
    provider: "apple",
    providerUserId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: suppliedName.trim().slice(0, 120),
  };
}
