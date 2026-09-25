import { and, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { trackMany, type ServerEvent } from "../lib/posthog";
import { DAY, startOfLocalDay } from "../lib/time";
import type { Env, Variables } from "../types";
import { readStudySky } from "../lib/constellations";
import { awardFocusXp } from "../lib/rewards";

interface SessionInput {
  activityId?: string;
  type?: string;
  seconds?: number;
  subject?: string | null;
  goal?: string | null;
  distractions?: number;
  endedAt?: string;
}

const studySessions = new Hono<{ Bindings: Env; Variables: Variables }>();

// FocusView posts an array, so accept both an array and a single object.
studySessions.post("/", async (c) => {
  const { userId } = c.get("session");
  const payload = await c.req.json<SessionInput[] | SessionInput>().catch(() => null);
  if (!payload) return c.json({ error: "Invalid request." }, 400);

  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length > 100) return c.json({ error: "Too many sessions in one request." }, 422);

  const database = db(c.env.DB);
  const [profile] = await database.select({ timezone: schema.profiles.timezone }).from(schema.profiles).where(eq(schema.profiles.userId, userId));
  const subjects = await database.select({ id: schema.subjects.id, name: schema.subjects.name }).from(schema.subjects).where(eq(schema.subjects.userId, userId));
  let dayFormat: Intl.DateTimeFormat;
  try { dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: profile?.timezone || "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }); }
  let stored = 0;
  const acceptedActivityIds: string[] = [];
  const rewards: { xp: number; source: string }[] = [];
  const saved: ServerEvent[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const seconds = Number(item.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 3600) continue;

    const parsedEnd = Date.parse(String(item.endedAt ?? ""));
    const endedAt = Number.isNaN(parsedEnd) ? Date.now() : parsedEnd;
    if (endedAt > Date.now() + 5 * 60_000 || endedAt < 0) continue;
    if (item.activityId !== undefined && (typeof item.activityId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(item.activityId))) continue;
    const subject = item.subject ? String(item.subject).trim().slice(0, 80) : null;
    const knownSubject = subjects.find((row) => row.name.toLocaleLowerCase("en-AU") === subject?.toLocaleLowerCase("en-AU"));
    const inserted = await database.insert(schema.studySessions).values({
      id: newId("ses"),
      activityId: item.activityId || null,
      localDay: dayFormat.format(new Date(endedAt)),
      subjectKey: knownSubject ? `subject:${knownSubject.id}` : subject?.toLocaleLowerCase("en-AU") || null,
      userId,
      type: String(item.type ?? "focus").slice(0, 32),
      seconds: Math.round(seconds),
      subject,
      goal: item.goal ? String(item.goal).slice(0, 200) : null,
      distractions: Number.isFinite(Number(item.distractions))
        ? Math.max(0, Math.round(Number(item.distractions)))
        : 0,
      endedAt,
    }).onConflictDoNothing({ target: [schema.studySessions.userId, schema.studySessions.activityId] }).returning({ id: schema.studySessions.id });
    stored += inserted.length;
    if (inserted[0] && String(item.type ?? "focus") !== "break") {
      rewards.push(...await awardFocusXp(database, userId, inserted[0].id, seconds / 60, startOfLocalDay(endedAt, profile?.timezone || "Australia/Sydney")));
      saved.push({
        userId,
        event: "focus_session_saved",
        properties: { minutes: Math.round(seconds / 60), type: String(item.type ?? "focus").slice(0, 32), hasSubject: Boolean(knownSubject) },
      });
    }
    if (item.activityId) acceptedActivityIds.push(item.activityId);
  }

  // The activity is already durable. Reconciliation can safely retry on a sky
  // read if a transient failure occurs after saving the session.
  await readStudySky(database, userId).catch((error) => console.error("[study-sky] Reconciliation deferred", error));
  trackMany(c, saved);
  return c.json({ ok: true, stored, acceptedActivityIds, rewards }, 201);
});

studySessions.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await db(c.env.DB)
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.endedAt, Date.now() - 30 * DAY),
      ),
    );
  return c.json({
    sessions: rows.map((row) => ({
      id: row.id,
      type: row.type,
      seconds: row.seconds,
      subject: row.subject,
      goal: row.goal,
      distractions: row.distractions,
      endedAt: new Date(row.endedAt).toISOString(),
    })),
  });
});

export default studySessions;
