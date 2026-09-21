import { and, eq, isNotNull } from "drizzle-orm";
import { schema, type Database } from "../db";
import { newId } from "./ids";
import { parseIcs } from "./ics";
import { DAY } from "./time";

// Anything further out than this is noise — a class recurrence six months
// ahead doesn't help planning today, and it lets us cap the row count.
const SYNC_HORIZON = 60 * DAY;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — Canvas feeds are the largest

export interface SyncResult {
  status: "updated" | "unchanged" | "error";
  eventsWritten?: number;
  error?: string;
}

/**
 * Pull an .ics feed, parse its VEVENTs, and reconcile them against the
 * `events` table. Returns a result the caller can persist onto the
 * calendar_feeds row (last_sync_at, last_sync_error, etag/last_modified).
 *
 * The reconciliation strategy is upsert-by-externalUid: if the feed still
 * lists a UID we've seen before, we update the existing row; if it drops
 * one we saw last time, we delete that row. This keeps deleted events from
 * the source calendar from lingering in Arcadia.
 */
export async function syncFeed(
  database: Database,
  feed: typeof schema.calendarFeeds.$inferSelect,
): Promise<SyncResult & { etag?: string | null; lastModified?: string | null }> {
  // Conditional fetch — skip parsing when the source calendar hasn't
  // changed. Apple/Google honour this, Canvas is inconsistent, but sending
  // both headers is safe and cheap.
  const headers: Record<string, string> = {
    accept: "text/calendar, text/plain, */*",
    "user-agent": "Arcadia/1.0 (+https://arcadiahq.app)",
  };
  if (feed.etag) headers["if-none-match"] = feed.etag;
  if (feed.lastModified) headers["if-modified-since"] = feed.lastModified;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(normaliseUrl(feed.url), { headers, signal: controller.signal });
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Feed fetch failed." };
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 304) {
    return { status: "unchanged" };
  }
  if (!response.ok) {
    return {
      status: "error",
      error: `Feed responded ${response.status} ${response.statusText}`.trim(),
    };
  }

  // Guard against a hostile or misconfigured server serving a multi-GB
  // stream. We read into a bounded buffer and stop once we're over the cap.
  const reader = response.body?.getReader();
  if (!reader) return { status: "error", error: "Empty response." };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return { status: "error", error: "Calendar feed is larger than 5 MB." };
    }
    chunks.push(value);
  }
  const text = new TextDecoder("utf-8").decode(concat(chunks));

  const parsed = parseIcs(text, SYNC_HORIZON);
  const now = Date.now();

  const existing = await database
    .select({ id: schema.events.id, externalUid: schema.events.externalUid })
    .from(schema.events)
    .where(and(eq(schema.events.feedId, feed.id), isNotNull(schema.events.externalUid)));
  const existingByUid = new Map<string, string>();
  for (const row of existing) {
    if (row.externalUid) existingByUid.set(row.externalUid, row.id);
  }

  const seenUids = new Set<string>();

  for (const event of parsed) {
    seenUids.add(event.uid);
    const description = [event.description, event.location].filter(Boolean).join(" · ").slice(0, 500);
    const existingId = existingByUid.get(event.uid);
    if (existingId) {
      await database
        .update(schema.events)
        .set({
          title: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
          subject: description || null,
          source: "feed",
          editable: false,
          pinned: true,
        })
        .where(eq(schema.events.id, existingId));
    } else {
      await database.insert(schema.events).values({
        id: newId("evt"),
        userId: feed.userId,
        feedId: feed.id,
        externalUid: event.uid,
        title: event.title,
        subject: description || null,
        category: "external",
        kind: event.allDay ? "all-day" : "external",
        startAt: event.startAt,
        endAt: event.endAt,
        status: "planned",
        outcome: "planned",
        source: "feed",
        editable: false,
        pinned: true,
        createdAt: now,
      });
    }
  }

  // Prune rows for events the source calendar has removed.
  for (const [uid, id] of existingByUid) {
    if (!seenUids.has(uid)) {
      await database.delete(schema.events).where(eq(schema.events.id, id));
    }
  }

  return {
    status: "updated",
    eventsWritten: parsed.length,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

// Apple/Google share URLs sometimes come as webcal:// which is a nonstandard
// scheme meaning "fetch this over http(s)". Rewrite it or fetch() will throw.
function normaliseUrl(url: string): string {
  if (url.startsWith("webcal://")) return "https://" + url.slice("webcal://".length);
  return url;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Wraps syncFeed to also write the result back to the feed row so the UI
 * can display last-sync state and errors without a second round-trip.
 */
export async function syncAndRecord(
  database: Database,
  feed: typeof schema.calendarFeeds.$inferSelect,
): Promise<SyncResult> {
  const result = await syncFeed(database, feed);
  const now = Date.now();
  if (result.status === "error") {
    await database
      .update(schema.calendarFeeds)
      .set({ lastSyncAt: now, lastSyncError: result.error?.slice(0, 300) ?? "Unknown error." })
      .where(eq(schema.calendarFeeds.id, feed.id));
  } else {
    const updates: Partial<typeof schema.calendarFeeds.$inferInsert> = {
      lastSyncAt: now,
      lastSyncError: null,
    };
    if (result.status === "updated") {
      if (result.etag !== undefined) updates.etag = result.etag ?? null;
      if (result.lastModified !== undefined) updates.lastModified = result.lastModified ?? null;
    }
    await database.update(schema.calendarFeeds).set(updates).where(eq(schema.calendarFeeds.id, feed.id));
  }
  return result;
}
