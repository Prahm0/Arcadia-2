import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { rebuildSchedule, subjectKey, uniqueSubjects, weeklyBudget, type WeeklyBudget } from "../lib/scheduler";
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
import { termsAround } from "../lib/terms";
import { computeStreaks, minutesBetween } from "../lib/analytics";
import type { Env, Variables } from "../types";

/** How far back planner events are sent, for streaks and this week's history. */
const STREAK_HISTORY_DAYS = 60;

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

  const [subjectRows, taskRows, commitmentRows, eventRows, companionRow, googleRow, feedRows, topicRows, assessmentRows] =
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
            // Past days are needed for the streak (lib/app/streaks.ts walks
            // back through completed blocks); without them no streak could
            // ever count more than today.
            gte(schema.events.startAt, start - STREAK_HISTORY_DAYS * DAY),
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
      database
        .select({ subjectId: schema.subjectTopics.subjectId })
        .from(schema.subjectTopics)
        .where(eq(schema.subjectTopics.userId, userId)),
      database
        .select({ subjectId: schema.subjectAssessments.subjectId })
        .from(schema.subjectAssessments)
        .where(eq(schema.subjectAssessments.userId, userId)),
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

  // Days the student used Life happened. A day they recovered and still
  // studied is protected on the streak (lib/app/streaks.ts).
  const recoveryRows = await database
    .select({ createdAt: schema.xpEvents.createdAt })
    .from(schema.xpEvents)
    .where(
      and(
        eq(schema.xpEvents.userId, userId),
        eq(schema.xpEvents.source, "recovery"),
        gte(schema.xpEvents.createdAt, now - 120 * DAY),
      ),
    );

  const analytics = {
    ...computeStreaks(sessions, timezone),
    recoveryDays: [...new Set(recoveryRows.map((row) => localDateKey(row.createdAt, timezone)))],
    todayMinutes: minutesBetween(
      sessions.filter((s) => localDateKey(s.endedAt, timezone) === todayKey),
    ),
    weekMinutes: minutesBetween(sessions.filter((s) => s.endedAt >= weekStart)),
    // Focus minutes for each of the last seven days, oldest first, ending today.
    days: Array.from({ length: 7 }, (_, index) => {
      const key = localDateKey(now - (6 - index) * DAY, timezone);
      return {
        date: key,
        minutes: minutesBetween(
          sessions.filter((s) => s.type !== "break" && localDateKey(s.endedAt, timezone) === key),
        ),
      };
    }),
  };

  // The companion grows with all the focus time ever logged, not just recent.
  const [{ seconds: focusSeconds } = { seconds: 0 }] = await database
    .select({ seconds: sql<number>`coalesce(sum(${schema.studySessions.seconds}), 0)` })
    .from(schema.studySessions)
    .where(and(eq(schema.studySessions.userId, userId), ne(schema.studySessions.type, "break")));
  const focusedMinutes = Math.round(Number(focusSeconds) / 60);
  const level = COMPANION_LEVELS.filter((threshold) => focusedMinutes >= threshold).length;

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

  // Blocks the student took off the schedule stay in the table (they hold the
  // slot so it isn't refilled) but aren't shown.
  const events = eventRows
    .filter((event) => event.status !== "cancelled")
    .sort((a, b) => a.startAt - b.startAt)
    .map(serialiseEvent);

  const focus = pending.slice(0, 5).map(serialiseTask);

  return c.json({
    user: serialiseUser(user, profile ?? null),
    profile: serialiseProfile(profile ?? null),
    preferences: serialisePreferences(profile ?? null),
    subjects: subjectRows.map((subject) => serialiseSubject(subject, profile?.grade)),
    tasks: pending.map(serialiseTask),
    commitments: commitmentRows.map(serialiseCommitment),
    range: { start: iso(start), end: iso(end) },
    // The student's school terms, for the planner's term view. Empty outside the states we have dates for.
    terms: termsAround(profile?.state, Number(localDateKey(now, timezone).slice(0, 4))),
    events,
    focusTasks: focus,
    notices: buildNotices({
      events,
      subjects: subjectRows,
      withSyllabus: new Set([...topicRows, ...assessmentRows].map((row) => row.subjectId)),
      budget: profile ? weeklyBudget(profile, subjectRows) : null,
    }),
    analytics,
    companion: {
      focusedMinutes,
      level,
      nextLevelMinutes: COMPANION_LEVELS[level] ?? null,
      ...(companionRow[0]
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
      : { profile: null }),
    },
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

/** Focus minutes each companion level starts at: 0, 5h, 20h, 50h. */
const COMPANION_LEVELS = [0, 300, 1200, 3000];

export interface Notice {
  /** Changes when what the notice says changes, so a snoozed one comes back if it's different. */
  id: string;
  kind: "budget" | "syllabus";
  title: string;
  body: string;
  action: { label: string; href: string };
}

/**
 * Things worth interrupting the student for: only what they can act on,
 * and nothing that's just a recap of the week.
 */
function buildNotices({
  events,
  subjects,
  withSyllabus,
  budget,
}: {
  events: ReturnType<typeof serialiseEvent>[];
  subjects: Array<typeof schema.subjects.$inferSelect>;
  withSyllabus: Set<string>;
  budget: WeeklyBudget | null;
}): Notice[] {
  const notices: Notice[] = [];

  // The scheduler shrinks every subject evenly when targets outgrow the
  // daily cap; say so rather than leaving them to wonder why.
  if (budget && budget.targetMinutes > budget.capacityMinutes) {
    notices.push({
      id: `budget:${budget.targetMinutes}:${budget.capacityMinutes}`,
      kind: "budget",
      title: "Your targets don't fit in a week",
      body: `Your subjects ask for ${formatHours(budget.targetMinutes)} a week but your daily limit fits ${formatHours(budget.capacityMinutes)}, so each subject gets about ${Math.round((budget.capacityMinutes / budget.targetMinutes) * 20) * 5}% of its target.`,
      action: { label: "Adjust targets", href: "/app/profile#subjects" },
    });
  }

  // Subjects with study coming up this week that Arcad knows nothing about.
  const now = Date.now();
  const studying = new Set(
    events
      .filter((event) => event.category === "study" && Date.parse(event.endAt) > now)
      .map((event) => subjectKey(event.subject)),
  );
  const bare = uniqueSubjects(subjects).filter(
    (subject) => studying.has(subjectKey(subject.name)) && !withSyllabus.has(subject.id),
  );
  if (bare.length > 0) {
    const names = bare.map((subject) => subject.name);
    notices.push({
      id: `syllabus:${bare.map((subject) => subject.id).sort().join(",")}`,
      kind: "syllabus",
      title:
        bare.length === 1
          ? `Add your ${names[0]} syllabus`
          : bare.length === 2
            ? `Add your ${names[0]} and ${names[1]} syllabuses`
            : `${bare.length} subjects have no syllabus yet`,
      body: "Arcad plans each session around what you're covering in class. Without it, sessions stay general.",
      action: {
        label: "Add syllabus",
        href: bare.length === 1 ? `/app/profile/subjects/${encodeURIComponent(bare[0].id)}` : "/app/profile#subjects",
      },
    });
  }

  return notices;
}

/** "14h", "13h 30m". */
function formatHours(minutes: number): string {
  const rounded = Math.round(minutes / 30) * 30;
  const hours = Math.floor(rounded / 60);
  return rounded % 60 ? `${hours}h 30m` : `${hours}h`;
}

export default dashboard;
