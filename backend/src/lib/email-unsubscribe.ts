import type { Env } from "../types";

/**
 * One-click unsubscribe tokens: `<userId>.<signature>`, signed with an
 * HMAC-SHA256 over a purpose-prefixed userId. There is no expiry on purpose:
 * an unsubscribe link in an old email must keep working. The signature is
 * the whole credential, and it can only turn reminders OFF, so a leaked link
 * is low risk. TOKEN_ENCRYPTION_KEY is reused as the HMAC key, as the Google
 * OAuth state already does; the "email-unsubscribe:" prefix keeps the two
 * kinds of signature from being swapped.
 */
const PURPOSE = "email-unsubscribe:";

function keyBytes(raw: string): Uint8Array {
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sign(rawKey: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes(rawKey) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${PURPOSE}${userId}`)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signUnsubscribeToken(env: Env, userId: string): Promise<string | null> {
  if (!env.TOKEN_ENCRYPTION_KEY) return null;
  return `${userId}.${await sign(env.TOKEN_ENCRYPTION_KEY, userId)}`;
}

/** The userId the token was signed for, or null if it is missing, malformed or tampered with. */
export async function verifyUnsubscribeToken(env: Env, token: string): Promise<string | null> {
  if (!env.TOKEN_ENCRYPTION_KEY || token.length > 200) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const userId = token.slice(0, dot);
  try {
    const expected = await sign(env.TOKEN_ENCRYPTION_KEY, userId);
    return constantTimeEqual(expected, token.slice(dot + 1)) ? userId : null;
  } catch {
    return null;
  }
}

/** Public URL of the unsubscribe endpoint. It goes through the Next proxy (/api/*) like every other call. */
export function unsubscribeUrl(env: Env, token: string): string {
  return `${env.APP_ORIGIN}/api/email-reminders/unsubscribe?token=${encodeURIComponent(token)}`;
}
