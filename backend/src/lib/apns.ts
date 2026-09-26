import { SignJWT, importPKCS8 } from "jose";
import type { Env } from "../types";

/**
 * Apple Push Notification service, for check-ins on the iOS app. The Worker
 * signs its own provider token (ES256, like Sign in with Apple) and posts one
 * request per device. APNs speaks HTTP/2 only: this works on deployed
 * Workers, but not from `wrangler dev`, whose fetch can't reach it.
 */

export type ApnsEnvironment = "production" | "sandbox";

const HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

export interface ApnsAlert {
  title: string;
  body: string;
  /** Replaces an earlier notification with the same id (max 64 bytes). */
  collapseId: string;
  /** Where a tap takes the student, an /app path. */
  link: string;
  /** Apple drops the alert if the phone can't be reached by then. */
  expiresInSeconds: number;
}

export type ApnsResult =
  | { ok: true; environment: ApnsEnvironment }
  | { ok: false; status: number; reason: string; gone: boolean };

type ConfiguredEnv = Env & Required<Pick<Env, "APNS_KEY_ID" | "APNS_PRIVATE_KEY" | "APNS_TEAM_ID">>;

export function apnsConfigured(env: Env): env is ConfiguredEnv {
  return Boolean(env.APNS_KEY_ID && env.APNS_PRIVATE_KEY && env.APNS_TEAM_ID && env.APPLE_BUNDLE_ID);
}

// Apple wants the same provider token reused for up to an hour, and rejects
// one refreshed more than every 20 minutes. Kept per isolate.
let cachedToken: { keyId: string; value: string; issuedAt: number } | null = null;
const TOKEN_REUSE_MS = 40 * 60_000;

async function providerToken(env: ConfiguredEnv): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.keyId === env.APNS_KEY_ID && now - cachedToken.issuedAt < TOKEN_REUSE_MS) {
    return cachedToken.value;
  }
  const key = await importPKCS8(env.APNS_PRIVATE_KEY.replace(/\\n/g, "\n"), "ES256");
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APNS_KEY_ID })
    .setIssuer(env.APNS_TEAM_ID)
    .setIssuedAt(Math.floor(now / 1000))
    .sign(key);
  cachedToken = { keyId: env.APNS_KEY_ID, value, issuedAt: now };
  return value;
}

async function post(
  env: ConfiguredEnv,
  environment: ApnsEnvironment,
  deviceToken: string,
  alert: ApnsAlert,
): Promise<{ status: number; reason: string }> {
  const host = env.APNS_BASE_URL ? `${env.APNS_BASE_URL.replace(/\/$/, "")}/${environment}` : HOSTS[environment];
  let response: Response;
  try {
    response = await fetch(`${host}/3/device/${encodeURIComponent(deviceToken)}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${await providerToken(env)}`,
        "apns-topic": env.APPLE_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + alert.expiresInSeconds),
        "apns-collapse-id": alert.collapseId.slice(0, 64),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert: { title: alert.title, body: alert.body },
          sound: "default",
          "thread-id": "arcadia-checkins",
        },
        link: alert.link,
      }),
    });
  } catch (error) {
    // A bad key or an unreachable APNs fails this phone, not the whole cron run.
    return { status: 0, reason: error instanceof Error ? error.message : "RequestFailed" };
  }
  if (response.ok) return { status: response.status, reason: "" };
  const detail = await response.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  const reason = detail.reason ?? "";
  if (response.status === 403 && (reason === "ExpiredProviderToken" || reason === "InvalidProviderToken")) {
    cachedToken = null;
  }
  return { status: response.status, reason };
}

/**
 * Sends one alert. A token can come from either APNs host (an Xcode build
 * gets sandbox tokens), so a BadDeviceToken is tried once on the other host
 * before the token counts as gone; the caller stores whichever host worked.
 */
export async function sendApns(
  env: Env,
  device: { token: string; environment: ApnsEnvironment },
  alert: ApnsAlert,
): Promise<ApnsResult> {
  if (!apnsConfigured(env)) return { ok: false, status: 0, reason: "NotConfigured", gone: false };
  let result = await post(env, device.environment, device.token, alert);
  if (result.status === 200) return { ok: true, environment: device.environment };
  if (result.status === 400 && result.reason === "BadDeviceToken") {
    const other: ApnsEnvironment = device.environment === "production" ? "sandbox" : "production";
    const retry = await post(env, other, device.token, alert);
    if (retry.status === 200) return { ok: true, environment: other };
    result = retry;
  }
  const gone = result.status === 410 || (result.status === 400 && result.reason === "BadDeviceToken");
  return { ok: false, status: result.status, reason: result.reason, gone };
}
