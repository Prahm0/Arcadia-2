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
type Transport = "cookie" | "bearer";

function cookieOptions(c: Ctx) {
  return {
    httpOnly: true,
    secure: new URL(c.env.APP_ORIGIN).protocol === "https:",
    sameSite: "Lax" as const,
    path: "/",
  };
}

export function clearSessionCookie(c: Ctx) {
  setCookie(c, SESSION_COOKIE, "", { ...cookieOptions(c), maxAge: 0 });
}

export async function createSession(c: Ctx, userId: string, transport: Transport = "cookie") {
  const raw = newToken(32);
  const id = await sha256Hex(raw);
  const csrfToken = newToken(24);
  const expiresAt = Date.now() + SESSION_TTL;
  await db(c.env.DB).insert(schema.sessions).values({ id, userId, csrfToken, expiresAt });
  if (transport === "cookie") {
    setCookie(c, SESSION_COOKIE, raw, {
      ...cookieOptions(c),
      maxAge: Math.floor(SESSION_TTL / 1000),
    });
  }
  return { csrfToken, expiresAt, bearerToken: transport === "bearer" ? raw : undefined };
}

function presentedCredential(c: Ctx): { raw: string | null | undefined; transport: Transport } {
  const authorization = c.req.header("authorization");
  const bearer = authorization?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  const transport: Transport = authorization ? "bearer" : "cookie";
  return { raw: bearer || (authorization ? null : getCookie(c, SESSION_COOKIE)), transport };
}

/**
 * Revokes whatever session the request carries, without a CSRF check: the
 * cookie is SameSite=Lax so another site can't trigger this, and a missing
 * CSRF token must never leave a live session behind a "signed out" screen.
 */
export async function destroySession(c: Ctx) {
  const { raw, transport } = presentedCredential(c);
  if (raw) {
    await db(c.env.DB).delete(schema.sessions).where(eq(schema.sessions.id, await sha256Hex(raw)));
  }
  if (transport === "cookie") clearSessionCookie(c);
}

/** Cookie writes require CSRF; explicit bearer credentials have no ambient CSRF risk. */
export const requireSession: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c, next,
) => {
  const { raw, transport } = presentedCredential(c);
  if (!raw) return c.json({ error: "Not signed in." }, 401);

  const id = await sha256Hex(raw);
  const database = db(c.env.DB);
  const [session] = await database.select().from(schema.sessions).where(eq(schema.sessions.id, id)).limit(1);
  if (!session) return c.json({ error: "Not signed in." }, 401);
  if (session.expiresAt < Date.now()) {
    await database.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return c.json({ error: "Session expired." }, 401);
  }

  const method = c.req.method.toUpperCase();
  if (transport === "cookie" && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const provided = c.req.header("x-csrf-token") ?? "";
    if (!timingSafeEqual(provided, session.csrfToken)) {
      return c.json({ error: "Invalid CSRF token." }, 403);
    }
  }

  c.set("session", {
    userId: session.userId,
    sessionId: session.id,
    csrfToken: session.csrfToken,
    transport,
  });
  await next();
};
