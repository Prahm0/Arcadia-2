import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { db, schema } from "../db";
import { newToken, sha256Hex, timingSafeEqual } from "./ids";
import { DAY } from "./time";
import type { Env, Variables } from "../types";

export const SESSION_COOKIE = "arcadia_session";
const SESSION_TTL = 30 * DAY;

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

export async function createSession(c: Ctx, userId: string) {
  const raw = newToken(32);
  const id = await sha256Hex(raw);
  const csrfToken = newToken(24);
  const expiresAt = Date.now() + SESSION_TTL;

  await db(c.env.DB).insert(schema.sessions).values({ id, userId, csrfToken, expiresAt });

  setCookie(c, SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL / 1000),
  });

  return { csrfToken, expiresAt };
}

export async function destroySession(c: Ctx) {
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw) {
    const id = await sha256Hex(raw);
    await db(c.env.DB).delete(schema.sessions).where(eq(schema.sessions.id, id));
  }
  setCookie(c, SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Requires a live session. Also enforces CSRF on unsafe methods: the client
 * echoes the token it was handed in JSON back through x-csrf-token, which a
 * cross-site page cannot read.
 */
export const requireSession: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next,
) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return c.json({ error: "Not signed in." }, 401);

  const id = await sha256Hex(raw);
  const database = db(c.env.DB);
  const [session] = await database
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, id))
    .limit(1);

  if (!session) return c.json({ error: "Not signed in." }, 401);

  if (session.expiresAt < Date.now()) {
    await database.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return c.json({ error: "Session expired." }, 401);
  }

  const method = c.req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const provided = c.req.header("x-csrf-token") ?? "";
    if (!timingSafeEqual(provided, session.csrfToken)) {
      return c.json({ error: "Invalid CSRF token." }, 403);
    }
  }

  c.set("session", {
    userId: session.userId,
    sessionId: session.id,
    csrfToken: session.csrfToken,
  });

  await next();
};
