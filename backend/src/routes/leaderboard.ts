import { and, desc, eq, gt, gte, like, not, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { rankCommunityLeaderboard } from "../lib/community-leaderboard";
import { DAY } from "../lib/time";
import type { Env, Variables } from "../types";

const leaderboard = new Hono<{ Bindings: Env; Variables: Variables }>();
const WINDOW_MS = 7 * DAY;
const MAX_ROWS = 100;

type LeaderboardBody = { optedIn?: unknown };

leaderboard.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const now = Date.now();
  const focusSeconds = sql<number>`coalesce(sum(${schema.studySessions.seconds}), 0)`;
  const rows = await database
    .select({ userId: schema.studySessions.userId, seconds: focusSeconds })
    .from(schema.studySessions)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.studySessions.userId))
    .innerJoin(schema.users, eq(schema.users.id, schema.studySessions.userId))
    .where(and(
      eq(schema.profiles.communityLeaderboardOptIn, true),
      eq(schema.studySessions.type, "focus"),
      gt(schema.studySessions.seconds, 0),
      gte(schema.studySessions.endedAt, now - WINDOW_MS),
      not(like(schema.users.email, "%@arcadia.local")),
    ))
    .groupBy(schema.studySessions.userId)
    .orderBy(desc(focusSeconds), schema.studySessions.userId)
    .limit(MAX_ROWS);
  const [profile] = await database
    .select({ optedIn: schema.profiles.communityLeaderboardOptIn })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);

  const entries = rankCommunityLeaderboard(rows.map((row) => ({ userId: row.userId, seconds: Number(row.seconds) })), userId)
    .map((entry) => ({ id: entry.userId, place: entry.place, name: entry.name, seconds: entry.seconds, isYou: entry.isYou }));
  return c.json({ optedIn: profile?.optedIn ?? false, entries, updatedAt: now });
});

leaderboard.patch("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<LeaderboardBody>().catch(() => null);
  if (!body || typeof body.optedIn !== "boolean") return c.json({ error: "Choose whether to join the community leaderboard." }, 400);

  const database = db(c.env.DB);
  const [user] = await database
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);
  if (user.email.endsWith("@arcadia.local")) {
    return c.json({ error: "Create an account to join the community leaderboard.", code: "guest_cannot_use" }, 403);
  }
  await database
    .update(schema.profiles)
    .set({ communityLeaderboardOptIn: body.optedIn })
    .where(eq(schema.profiles.userId, userId));
  return c.json({ optedIn: body.optedIn });
});

export default leaderboard;
