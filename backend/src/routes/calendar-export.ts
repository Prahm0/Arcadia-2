import { and, eq, gte, lt } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { newToken } from "../lib/ids";
import { buildIcs } from "../lib/ics-export";
import { track } from "../lib/posthog";
import { DAY, MINUTE, localDateKey } from "../lib/time";
import type { Env, Variables } from "../types";

/**
 * Export: a private .ics link the student subscribes to from Google
 * Calendar or Apple Calendar. The settings routes need a session; the feed
 * itself is public (listed in PUBLIC_PREFIXES) because calendar apps fetch
 * it without cookies, so the unguessable token is the credential.
 */
const calendarExport = new Hono<{ Bindings: Env; Variables: Variables }>();

const FEED_PREFIX = "/api/calendar-export/feed/";
/** Recent history stays visible; the plan only runs a few weeks ahead anyway. */
const PAST_MS = 14 * DAY;
const AHEAD_MS = 120 * DAY;
/** Calendar apps poll often; only record a fetch every so often. */
const FETCH_WRITE_EVERY = 30 * MINUTE;

// Arcadia's own blocks only. Imported events already live in the student's
// calendar, commitments are things they entered themselves, and sleep would
// fill every night with noise.
const SKIPPED_SOURCES = new Set(["feed", "google", "outlook", "commitment", "sleep"]);
const SKIPPED_CATEGORIES = new Set(["external", "sleep"]);

function feedUrl(env: Env, token: string) {
  return `${env.APP_ORIGIN}${FEED_PREFIX}${token}.ics`;
}

async function readExport(database: Database, userId: string) {
  const [row] = await database
    .select()
    .from(schema.calendarExports)
    .where(eq(schema.calendarExports.userId, userId))
    .limit(1);
  return row;
}

function serialise(env: Env, row: typeof schema.calendarExports.$inferSelect | undefined) {
  if (!row) return { url: null, lastFetchedAt: null };
  return {
    url: feedUrl(env, row.token),
    lastFetchedAt: row.lastFetchedAt ? new Date(row.lastFetchedAt).toISOString() : null,
  };
}

calendarExport.get("/", async (c) => {
  const { userId } = c.get("session");
  return c.json(serialise(c.env, await readExport(db(c.env.DB), userId)));
});

/** Creates the link, or replaces it so any old copy stops working. */
calendarExport.post("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [user] = await database
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user || user.email.endsWith("@arcadia.local")) {
    return c.json({ error: "Create an account to add Arcadia to your calendar.", code: "guest_cannot_use" }, 403);
  }

  const token = newToken(24);
  await database
    .insert(schema.calendarExports)
    .values({ userId, token })
    .onConflictDoUpdate({
      target: schema.calendarExports.userId,
      set: { token, createdAt: Date.now(), lastFetchedAt: null },
    });
  track(c, userId, "calendar_export_linked");
  return c.json(serialise(c.env, await readExport(database, userId)));
});

calendarExport.delete("/", async (c) => {
  const { userId } = c.get("session");
  await db(c.env.DB).delete(schema.calendarExports).where(eq(schema.calendarExports.userId, userId));
  return c.json({ ok: true });
});

calendarExport.get("/feed/:file", async (c) => {
  const token = /^([a-f0-9]{48})\.ics$/.exec(c.req.param("file"))?.[1];
  if (!token) return c.text("Not found.", 404);

  const database = db(c.env.DB);
  const [row] = await database
    .select()
    .from(schema.calendarExports)
    .where(eq(schema.calendarExports.token, token))
    .limit(1);
  if (!row) return c.text("Not found.", 404);

  const now = Date.now();
  const from = now - PAST_MS;
  const to = now + AHEAD_MS;
  const [profile] = await database
    .select({ timezone: schema.profiles.timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, row.userId))
    .limit(1);
  const timeZone = profile?.timezone ?? "Australia/Brisbane";

  const [events, tasks] = await Promise.all([
    database
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.userId, row.userId), gte(schema.events.startAt, from), lt(schema.events.startAt, to))),
    database
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.userId, row.userId), gte(schema.tasks.dueAt, from), lt(schema.tasks.dueAt, to))),
  ]);

  const blocks = events
    .filter(
      (event) =>
        event.status !== "cancelled" &&
        !event.feedId &&
        !event.externalUid &&
        !SKIPPED_SOURCES.has(event.source) &&
        !SKIPPED_CATEGORIES.has(event.category) &&
        event.endAt > event.startAt,
    )
    .sort((a, b) => a.startAt - b.startAt)
    .map((event) => ({
      id: event.id,
      title: event.title,
      subject: event.subject,
      startAt: event.startAt,
      endAt: event.endAt,
      outcome: event.outcome,
    }));

  const deadlines = tasks
    .filter((task) => task.status === "pending")
    .sort((a, b) => a.dueAt - b.dueAt)
    .map((task) => ({
      id: task.id,
      title: task.title,
      subject: task.subject,
      date: localDateKey(task.dueAt, timeZone),
    }));

  if (!row.lastFetchedAt || now - row.lastFetchedAt > FETCH_WRITE_EVERY) {
    c.executionCtx.waitUntil(
      database
        .update(schema.calendarExports)
        .set({ lastFetchedAt: now })
        .where(eq(schema.calendarExports.userId, row.userId))
        .then(() => undefined),
    );
  }

  const body = buildIcs({
    name: "Arcadia",
    appUrl: `${c.env.APP_ORIGIN}/app/schedule`,
    now,
    blocks,
    deadlines,
  });
  return c.body(body, 200, {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": 'inline; filename="arcadia.ics"',
    "cache-control": "private, no-cache",
  });
});

export default calendarExport;
