import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { rebuildSchedule } from "../lib/scheduler";
import {
  serialiseCommitment,
  serialiseEvent,
  serialisePreferences,
  serialiseProfile,
  serialiseSubject,
  serialiseTask,
  serialiseUser,
} from "../lib/serialise";
import { DAY, iso, localDateKey, startOfLocalDay } from "../lib/time";
import { computeStreaks, minutesBetween } from "../lib/analytics";
import type { Env, Variables } from "../types";

const dashboard = new Hono<{ Bindings: Env; Variables: Variables }>();

dashboard.get("/", async (c) => {
  const { userId, csrfToken } = c.get("session");
  const database = db(c.env.DB);

  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);

  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);

  const timezone = profile?.timezone ?? "Australia/Brisbane";
  const now = Date.now();
  const start = startOfLocalDay(now, timezone);
  const end = start + 7 * DAY;

  // Keep the plan current before reading it back.
  if (profile?.onboardingComplete) {
    await rebuildSchedule(database, userId, start, end);
  }

  const [subjectRows, taskRows, commitmentRows, eventRows, companionRow, googleRow, feedRows] =
    await Promise.all([
      database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)),
      database.select().from(schema.tasks).where(eq(schema.tasks.userId, userId)),
      database.select().from(schema.commitments).where(eq(schema.commitments.userId, userId)),
      database
        .select()
        .from(schema.events)
        .where(
          and(
            eq(schema.events.userId, userId),
            gte(schema.events.startAt, start),
            lte(schema.events.startAt, end),
          ),
        ),
      database
        .select()
        .from(schema.companions)
        .where(eq(schema.companions.userId, userId))
        .limit(1),
      database
        .select()
        .from(schema.googleAccounts)
        .where(eq(schema.googleAccounts.userId, userId))
        .limit(1),
      database
        .select()
        .from(schema.calendarFeeds)
        .where(eq(schema.calendarFeeds.userId, userId)),
    ]);

  const pending = taskRows
    .filter((task) => task.status === "pending")
    .sort((a, b) => a.dueAt - b.dueAt);

  const sessions = await database
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.endedAt, now - 120 * DAY),
      ),
    );

  const todayKey = localDateKey(now, timezone);
  const weekStart = start - 6 * DAY;

  const analytics = {
    ...computeStreaks(sessions, timezone),
    todayMinutes: minutesBetween(
      sessions.filter((s) => localDateKey(s.endedAt, timezone) === todayKey),
    ),
    weekMinutes: minutesBetween(sessions.filter((s) => s.endedAt >= weekStart)),
  };

  const conversationRows = await database
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(20);

  const proposalRows = await database
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.userId, userId), eq(schema.proposals.status, "pending")));

  const events = eventRows
    .sort((a, b) => a.startAt - b.startAt)
    .map(serialiseEvent);

  const focus = pending.slice(0, 5).map(serialiseTask);

  return c.json({
    user: serialiseUser(user, profile ?? null),
    profile: serialiseProfile(profile ?? null),
    preferences: serialisePreferences(profile ?? null),
    subjects: subjectRows.map(serialiseSubject),
    tasks: pending.map(serialiseTask),
    commitments: commitmentRows.map(serialiseCommitment),
    range: { start: iso(start), end: iso(end) },
    events,
    focusTasks: focus,
    briefing: buildBriefing(events, focus.length),
    analytics,
    companion: companionRow[0]
      ? {
          profile: {
            name: companionRow[0].name,
            form: companionRow[0].form,
            // Old rows may still carry the pre-picker "aurora" default;
            // treat anything the client can't render as violet.
            palette: ["violet", "aqua", "coral", "gold"].includes(companionRow[0].palette)
              ? companionRow[0].palette
              : "violet",
            accessory: companionRow[0].accessory ?? "none",
          },
          mood: companionRow[0].mood,
        }
      : null,
    csrfToken,
    assistant: {
      configured: Boolean(c.env.OPENAI_API_KEY),
      providerConfigured: Boolean(c.env.OPENAI_API_KEY),
      messages: [],
      proposals: proposalRows.map((proposal) => ({
        id: proposal.id,
        summary: proposal.summary,
        status: proposal.status,
        operations: JSON.parse(proposal.operations) as unknown[],
        createdAt: iso(proposal.createdAt),
        expiresAt: iso(proposal.expiresAt),
      })),
      conversations: conversationRows.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        createdAt: iso(conversation.createdAt),
        updatedAt: iso(conversation.updatedAt),
      })),
    },
    google: {
      connected: Boolean(googleRow[0]?.accessTokenEnc),
      lastSyncAt: googleRow[0]?.lastSyncAt ? iso(googleRow[0].lastSyncAt) : null,
    },
    calendarFeeds: feedRows.map((feed) => ({
      id: feed.id,
      url: feed.url,
      name: feed.name,
      color: feed.color,
      lastSyncAt: feed.lastSyncAt ? iso(feed.lastSyncAt) : null,
      lastSyncError: feed.lastSyncError,
    })),
  });
});

function buildBriefing(
  events: ReturnType<typeof serialiseEvent>[],
  focusCount: number,
): string | null {
  const now = Date.now();
  const upcoming = events.filter(
    (event) => event.category === "study" && Date.parse(event.startAt) >= now,
  );
  if (upcoming.length === 0) {
    return focusCount > 0
      ? "Nothing scheduled yet. Add a due date and Arcadia will find the time."
      : null;
  }
  const minutes = upcoming.reduce(
    (sum, event) => sum + Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000),
    0,
  );
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${upcoming.length} study block${upcoming.length === 1 ? "" : "s"} ahead, about ${hours}h in total.`;
}

export default dashboard;
