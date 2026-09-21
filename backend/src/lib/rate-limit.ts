import type { Context } from "hono";
import { sha256Hex } from "./ids";
import type { Env, Variables } from "../types";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;
type Action = "register" | "login" | "resend" | "forgot" | "reset";
const rules: Record<Action, { windowMs: number; ip: number; account: number }> = {
  register: { windowMs: 60 * 60_000, ip: 8, account: 3 },
  login: { windowMs: 15 * 60_000, ip: 30, account: 8 },
  resend: { windowMs: 60 * 60_000, ip: 12, account: 3 },
  forgot: { windowMs: 60 * 60_000, ip: 12, account: 3 },
  reset: { windowMs: 15 * 60_000, ip: 20, account: 8 },
};

async function consume(c: Ctx, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const digest = await sha256Hex(key);
  // One atomic UPSERT prevents concurrent Worker requests from evading a limit.
  const row = await c.env.DB.prepare(
    `INSERT INTO auth_rate_limits (key, count, reset_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN auth_rate_limits.reset_at <= ? THEN 1 ELSE auth_rate_limits.count + 1 END,
       reset_at = CASE WHEN auth_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE auth_rate_limits.reset_at END
     RETURNING count, reset_at`,
  ).bind(digest, now + windowMs, now, now).first<{ count: number; reset_at: number }>();
  if (!row || row.count <= limit) return null;
  c.header("Retry-After", String(Math.max(1, Math.ceil((row.reset_at - now) / 1000))));
  return c.json({ error: "Too many attempts. Please try again later." }, 429);
}

/** Cloudflare supplies this header; never trust a client-supplied forwarded-for chain. */
export async function throttle(c: Ctx, action: Action, accountKey?: string) {
  const rule = rules[action];
  const ip = c.req.header("cf-connecting-ip") || "local";
  const ipLimit = await consume(c, `${action}:ip:${ip}`, rule.ip, rule.windowMs);
  if (ipLimit) return ipLimit;
  if (accountKey) {
    return consume(c, `${action}:account:${accountKey.toLowerCase()}`, rule.account, rule.windowMs);
  }
  return null;
}
