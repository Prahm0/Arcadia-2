import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { syncAndRecord } from "../lib/sync-feed";
import type { Env, Variables } from "../types";

const feeds = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_FEEDS_PER_USER = 5;

// Only allow http/https URLs. Rejects file://, javascript:, data:, and
// anything else that could turn a paste-your-URL box into an SSRF vector.
function isSafeFeedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.replace(/^webcal:\/\//i, "https://"));
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function serialiseFeed(row: typeof schema.calendarFeeds.$inferSelect) {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    color: row.color,
    lastSyncAt: row.lastSyncAt ? new Date(row.lastSyncAt).toISOString() : null,
    lastSyncError: row.lastSyncError,
  };
}

feeds.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const rows = await database
    .select()
    .from(schema.calendarFeeds)
    .where(eq(schema.calendarFeeds.userId, userId));
  return c.json({ feeds: rows.map(serialiseFeed) });
});

feeds.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ url?: string; name?: string; color?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const url = String(body.url ?? "").trim();
  if (!url || !isSafeFeedUrl(url)) {
    return c.json({ error: "Enter a valid https:// or webcal:// calendar URL." }, 422);
  }

  const database = db(c.env.DB);
  const existing = await database
    .select({ id: schema.calendarFeeds.id })
    .from(schema.calendarFeeds)
    .where(eq(schema.calendarFeeds.userId, userId));
  if (existing.length >= MAX_FEEDS_PER_USER) {
    return c.json(
      { error: `You can subscribe to up to ${MAX_FEEDS_PER_USER} calendars.` },
      422,
    );
  }

  const name = String(body.name ?? "").trim().slice(0, 60) || guessName(url);
  const color = normaliseColor(body.color) ?? "#7c5cff";

  const id = newId("cfd");
  await database.insert(schema.calendarFeeds).values({
    id,
    userId,
    url,
    name,
    color,
  });

  // Sync immediately so the student sees events right away without having
  // to press "Sync now". Failures are swallowed here and surfaced in the
  // feed row's lastSyncError so the UI can render them.
  const [row] = await database
    .select()
    .from(schema.calendarFeeds)
    .where(eq(schema.calendarFeeds.id, id))
    .limit(1);
  if (row) await syncAndRecord(database, row);

  const [fresh] = await database
    .select()
    .from(schema.calendarFeeds)
    .where(eq(schema.calendarFeeds.id, id))
    .limit(1);
  return c.json({ feed: serialiseFeed(fresh!) });
});

feeds.post("/:id/sync", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const database = db(c.env.DB);
  const [row] = await database
    .select()
    .from(schema.calendarFeeds)
    .where(and(eq(schema.calendarFeeds.id, id), eq(schema.calendarFeeds.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Calendar not found." }, 404);

  const result = await syncAndRecord(database, row);
  const [fresh] = await database
    .select()
    .from(schema.calendarFeeds)
    .where(eq(schema.calendarFeeds.id, id))
    .limit(1);
  return c.json({
    feed: serialiseFeed(fresh!),
    result: {
      status: result.status,
      eventsWritten: result.eventsWritten,
      error: result.error,
    },
  });
});

feeds.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const database = db(c.env.DB);
  const [row] = await database
    .select({ id: schema.calendarFeeds.id })
    .from(schema.calendarFeeds)
    .where(and(eq(schema.calendarFeeds.id, id), eq(schema.calendarFeeds.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Calendar not found." }, 404);

  // Wipe the imported events first so schedule/dashboard don't briefly show
  // orphaned rows while the cascade fires (D1's ON DELETE isn't guaranteed
  // to be strictly ordered inside a single request).
  await database.delete(schema.events).where(eq(schema.events.feedId, id));
  await database.delete(schema.calendarFeeds).where(eq(schema.calendarFeeds.id, id));
  return c.json({ ok: true });
});

function guessName(url: string): string {
  try {
    const host = new URL(url.replace(/^webcal:\/\//i, "https://")).hostname;
    if (host.includes("apple") || host.includes("icloud")) return "Apple Calendar";
    if (host.includes("google")) return "Google Calendar";
    if (host.includes("instructure") || host.includes("canvas")) return "Canvas";
    if (host.includes("outlook") || host.includes("live")) return "Outlook";
    return "Calendar";
  } catch {
    return "Calendar";
  }
}

function normaliseColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

export default feeds;
