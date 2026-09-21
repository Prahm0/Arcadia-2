/**
 * Google OAuth 2.0 + Calendar API helpers.
 *
 * All the transport glue lives here so the route file can stay a thin
 * translation layer. Nothing here reaches into Hono or D1; the caller
 * supplies the Env and does the DB writes.
 *
 * OAuth model:
 *   - `authorizationUrl()` builds the URL we redirect the user to.
 *   - `exchangeCode()` swaps the auth code for tokens (first-time connect).
 *   - `refreshAccessToken()` renews an access token when it's near expiry.
 *   - `revokeToken()` invalidates both tokens when the user disconnects.
 *
 * State is a signed userId+nonce+expiry blob. The callback verifies the
 * signature against TOKEN_ENCRYPTION_KEY (repurposed as an HMAC key —
 * safe because HMAC and AES-GCM key uses don't cross-contaminate) so it
 * can identify the user even if their session cookie is missing.
 */

import type { Env } from "../types";

const SCOPES = [
  // Read-only for now — we import events for Arcadia to plan around, we
  // don't write generated study blocks back to Google (yet).
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
].join(" ");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function redirectUri(env: Env): string {
  // The Worker sits at api.<zone>, and Google redirects a top-level
  // navigation to whichever URL we registered in the OAuth client. That
  // URL is `${apiOrigin}/api/google/callback`, so we synthesise apiOrigin
  // by prepending `api.` to the APP_ORIGIN host (unless it already has it
  // — as in a hypothetical dev setup where APP_ORIGIN === Worker origin).
  const url = new URL(env.APP_ORIGIN);
  if (!url.hostname.startsWith("api.")) {
    url.hostname = `api.${url.hostname}`;
  }
  return `${url.origin}/api/google/callback`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
}

export async function authorizationUrl(env: Env, state: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID) throw new Error("Google client not configured.");
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: "code",
    scope: SCOPES,
    // `offline` = give us a refresh token so we can sync later without the
    // user re-consenting; `consent` prompt guarantees we get one even on
    // re-connect (Google otherwise skips it and no refresh token comes back).
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(env: Env, code: string): Promise<TokenResponse> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google client not configured.");
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(env),
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

export async function refreshAccessToken(env: Env, refreshToken: string): Promise<TokenResponse> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google client not configured.");
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number; scope: string };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

export async function revokeToken(token: string): Promise<void> {
  // Best-effort: if revoke fails (network hiccup, token already invalid),
  // we still wipe the row locally. The tokens have finite lifetime anyway.
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch (err) {
    console.warn("[google] revoke failed", err);
  }
}

export interface GoogleEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: number;
  endAt: number;
  allDay: boolean;
  status: string; // "confirmed", "tentative", "cancelled"
}

// Pulls events across the sync window from the user's primary calendar.
// The events API paginates via `nextPageToken`; we walk the pages until
// exhausted or until we hit the 500-event cap that mirrors the .ics sync.
export async function fetchEvents(
  accessToken: string,
  windowMs: { start: number; end: number },
): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(EVENTS_URL);
    url.searchParams.set("timeMin", new Date(windowMs.start).toISOString());
    url.searchParams.set("timeMax", new Date(windowMs.end).toISOString());
    url.searchParams.set("singleEvents", "true"); // unrolls recurring
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Google Calendar API returned ${response.status}: ${await response.text()}`);
    }
    const data = (await response.json()) as {
      items: Array<{
        id: string;
        summary?: string;
        description?: string;
        location?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        status?: string;
      }>;
      nextPageToken?: string;
    };

    for (const item of data.items) {
      if (item.status === "cancelled") continue;
      if (!item.start || !item.end) continue;
      const start = parseGoogleDate(item.start);
      const end = parseGoogleDate(item.end);
      if (start === null || end === null) continue;
      out.push({
        id: item.id,
        title: (item.summary ?? "(Untitled event)").slice(0, 200),
        description: (item.description ?? "").slice(0, 500),
        location: (item.location ?? "").slice(0, 200),
        startAt: start,
        endAt: end,
        allDay: Boolean(item.start.date),
        status: item.status ?? "confirmed",
      });
      if (out.length >= 500) return out;
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return out;
}

function parseGoogleDate(value: { dateTime?: string; date?: string }): number | null {
  if (value.dateTime) return Date.parse(value.dateTime);
  if (value.date) return Date.parse(`${value.date}T00:00:00Z`);
  return null;
}

// ────────── OAuth state helpers ──────────

/**
 * Signs a userId into an opaque state token so the callback knows which
 * Arcadia account this consent flow belongs to. Anyone can read the
 * userId, but tampering flips the signature and the callback rejects.
 */
export async function signState(env: Env, userId: string): Promise<string> {
  const key = env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY missing.");
  const nonce = crypto.getRandomValues(new Uint8Array(8));
  const nonceHex = Array.from(nonce, (b) => b.toString(16).padStart(2, "0")).join("");
  const expires = Date.now() + STATE_TTL_MS;
  const payload = `${userId}.${nonceHex}.${expires}`;
  const sig = await hmac(key, payload);
  return `${base64UrlEncode(payload)}.${sig}`;
}

export async function verifyState(env: Env, state: string): Promise<string | null> {
  const key = env.TOKEN_ENCRYPTION_KEY;
  if (!key) return null;
  const dot = state.lastIndexOf(".");
  if (dot === -1) return null;
  const encodedPayload = state.slice(0, dot);
  const providedSig = state.slice(dot + 1);
  let payload: string;
  try {
    payload = base64UrlDecode(encodedPayload);
  } catch {
    return null;
  }
  const expectedSig = await hmac(key, payload);
  if (!constantTimeEqual(expectedSig, providedSig)) return null;

  const parts = payload.split(".");
  if (parts.length !== 3) return null;
  const [userId, , expiresStr] = parts;
  const expires = Number(expiresStr);
  if (!userId || !Number.isFinite(expires) || expires < Date.now()) return null;
  return userId;
}

async function hmac(rawKey: string, payload: string): Promise<string> {
  const keyBytes = base64ToBytes(rawKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(sig));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "===".slice((normalised.length + 3) % 4);
  return atob(padded);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
