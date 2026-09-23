import { and, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { computeStreaks } from "../lib/analytics";
import { subjectWeekProgress } from "../lib/progress";
import { replan } from "../lib/replan";
import { subjectKey } from "../lib/scheduler";
import { serialiseCommitment, serialiseSubject } from "../lib/serialise";
import { currentTopic } from "../lib/syllabus";
import { DAY, iso, localDateKey, parseClock, startOfLocalWeek } from "../lib/time";
import { serialiseAssessment, serialiseFile, serialiseTopic } from "./syllabus";
import type { Env, Variables } from "../types";

export const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

/** A two-letter country code, uppercased, or null if it isn't one. */
export function countryCode(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) ? code : null;
}
const TEXT_LIMIT = 1500;

const profile = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Everything the profile page shows, in one read: who the student is, their
 * numbers, subjects with this week's progress, co-curriculars, goals, what
 * Arcad knows about them, and the study routine the planner works inside.
 */
export async function buildProfile(database: Database, userId: string) {
  const [[user], [row]] = await Promise.all([
    database.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1),
    database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
  ]);
  if (!user || !row) return null;

  const timezone = row.timezone;
  const now = Date.now();
  const weekStart = startOfLocalWeek(now, timezone);

  const [
    subjectRows,
    commitmentRows,
    goalRows,
    memoryRows,
    recentSessions,
    [totals],
    progress,
    fileRows,
    topicRows,
    assessmentRows,
  ] = await Promise.all([
      database
        .select()
        .from(schema.subjects)
        .where(eq(schema.subjects.userId, userId))
        .orderBy(asc(schema.subjects.createdAt)),
      database.select().from(schema.commitments).where(eq(schema.commitments.userId, userId)),
      database
        .select()
        .from(schema.goals)
        .where(eq(schema.goals.userId, userId))
        .orderBy(asc(schema.goals.createdAt)),
      database
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.userId, userId))
        .orderBy(desc(schema.memories.createdAt)),
      // A year back is enough for streaks without reading every session ever.
      database
        .select()
        .from(schema.studySessions)
        .where(
          and(
            eq(schema.studySessions.userId, userId),
            gte(schema.studySessions.endedAt, now - 400 * DAY),
          ),
        ),
      database
        .select({
          seconds: sql<number>`coalesce(sum(${schema.studySessions.seconds}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(schema.studySessions)
        .where(
          and(eq(schema.studySessions.userId, userId), ne(schema.studySessions.type, "break")),
        ),
      subjectWeekProgress(database, userId, timezone),
      database.select().from(schema.subjectFiles).where(eq(schema.subjectFiles.userId, userId)),
      database
        .select()
        .from(schema.subjectTopics)
        .where(eq(schema.subjectTopics.userId, userId))
        .orderBy(asc(schema.subjectTopics.position)),
      database.select().from(schema.subjectAssessments).where(eq(schema.subjectAssessments.userId, userId)),
    ]);
  const today = localDateKey(now, timezone);

  const streaks = computeStreaks(recentSessions, timezone);
  const weekFocusSeconds = recentSessions
    .filter((session) => session.type !== "break" && session.endedAt >= weekStart)
    .reduce((sum, session) => sum + session.seconds, 0);

  return {
    profile: {
      name: row.displayName || user.name,
      email: user.email,
      grade: row.grade,
      country: row.country,
      state: row.state,
      school: row.school,
      avatarColour: row.avatarColour,
      atarTarget: row.atarTarget,
      timezone,
      joinedAt: iso(user.createdAt),
      developerAccess: user.developerAccess,
    },
    stats: {
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      totalFocusMinutes: Math.round(Number(totals?.seconds ?? 0) / 60),
      totalSessions: Number(totals?.count ?? 0),
      weekFocusMinutes: Math.round(weekFocusSeconds / 60),
    },
    subjects: subjectRows.map((subject) => {
      const week = progress.get(subjectKey(subject.name));
      const files = fileRows.filter((file) => file.subjectId === subject.id);
      const subjectTopics = topicRows.filter((topic) => topic.subjectId === subject.id);
      const subjectAssessments = assessmentRows
        .filter((item) => item.subjectId === subject.id)
        .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
      const current = currentTopic(subjectTopics, today);
      const next = subjectAssessments.find((item) => item.dueOn && item.dueOn >= today);
      const syllabus = files.find((file) => file.kind === "syllabus");
      return {
        ...serialiseSubject(subject, row.grade),
        weekDoneMinutes: week?.doneMinutes ?? 0,
        weekPlannedMinutes: week?.plannedMinutes ?? 0,
        syllabus: syllabus ? serialiseFile(syllabus) : null,
        resources: files.filter((file) => file.kind === "resource").map(serialiseFile),
        topics: subjectTopics.map(serialiseTopic),
        assessments: subjectAssessments.map(serialiseAssessment),
        currentTopic: current ? { ...serialiseTopic(current.topic), upcoming: current.upcoming } : null,
        nextAssessment: next ? serialiseAssessment(next) : null,
      };
    }),
    commitments: commitmentRows.map(serialiseCommitment),
    goals: goalRows.map((goal) => ({
      id: goal.id,
      title: goal.title,
      done: goal.done,
      createdAt: iso(goal.createdAt),
    })),
    arcad: {
      about: row.arcadAbout,
      style: row.arcadStyle,
      memoryEnabled: row.memoryEnabled,
      memories: memoryRows.map((memory) => ({
        id: memory.id,
        content: memory.content,
        source: memory.source,
        createdAt: iso(memory.createdAt),
      })),
    },
    routine: {
      wakeTime: row.wakeTime,
      bedtime: row.bedtime,
      maxDailyStudyMinutes: row.maxDailyStudyMinutes,
      preferredSessionMinutes: row.preferredSessionMinutes,
      breakMinutes: row.breakMinutes,
    },
  };
}

profile.get("/", async (c) => {
  const { userId } = c.get("session");
  const payload = await buildProfile(db(c.env.DB), userId);
  if (!payload) return c.json({ error: "Not signed in." }, 401);
  return c.json(payload);
});

interface ProfileBody {
  name?: string;
  grade?: string | null;
  country?: string | null;
  state?: string | null;
  school?: string | null;
  avatarColour?: string | null;
  atarTarget?: number | null;
  arcadAbout?: string;
  arcadStyle?: string;
  memoryEnabled?: boolean;
  wakeTime?: string;
  bedtime?: string;
  maxDailyStudyMinutes?: number;
  preferredSessionMinutes?: number;
  breakMinutes?: number;
}

/** Any subset of fields; only what's sent changes. Replans when the plan's inputs moved. */
profile.patch("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<ProfileBody>().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);
  const patch: Partial<typeof schema.profiles.$inferInsert> = {};
  const optionalText = (value: unknown, limit: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 120);
    if (!name) return c.json({ error: "Your name can't be empty." }, 422);
    patch.displayName = name;
  }
  if (body.grade !== undefined) patch.grade = optionalText(body.grade, 32);
  if (body.country !== undefined) {
    const country = countryCode(body.country);
    if (body.country && !country) return c.json({ error: "Unknown country." }, 422);
    patch.country = country;
    // States only mean something in Australia.
    if (country !== "AU") patch.state = null;
  }
  // A state is kept for Australia, or while no country is set (accounts from
  // before countries existed were all Australian).
  const stateAllowed = async () => {
    if (body.country !== undefined) return patch.country === "AU";
    const [saved] = await database
      .select({ country: schema.profiles.country })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1);
    return !saved?.country || saved.country === "AU";
  };
  if (body.state !== undefined && (body.state === null || (await stateAllowed()))) {
    const state = optionalText(body.state, 8)?.toUpperCase() ?? null;
    if (state && !AU_STATES.includes(state)) return c.json({ error: "Pick an Australian state or territory." }, 422);
    patch.state = state;
  }
  if (body.school !== undefined) patch.school = optionalText(body.school, 120);
  if (body.avatarColour !== undefined) {
    const colour = optionalText(body.avatarColour, 7);
    if (colour && !/^#[0-9a-f]{6}$/i.test(colour)) return c.json({ error: "Unknown colour." }, 422);
    patch.avatarColour = colour;
  }
  if (body.atarTarget !== undefined) {
    if (body.atarTarget === null) {
      patch.atarTarget = null;
    } else {
      const atar = Number(body.atarTarget);
      if (!Number.isFinite(atar) || atar < 30 || atar > 99.95) {
        return c.json({ error: "An ATAR target is between 30 and 99.95." }, 422);
      }
      // ATARs come in steps of 0.05.
      patch.atarTarget = Math.round(atar * 20) / 20;
    }
  }
  if (body.arcadAbout !== undefined) patch.arcadAbout = String(body.arcadAbout).slice(0, TEXT_LIMIT);
  if (body.arcadStyle !== undefined) patch.arcadStyle = String(body.arcadStyle).slice(0, TEXT_LIMIT);
  if (body.memoryEnabled !== undefined) patch.memoryEnabled = Boolean(body.memoryEnabled);

  if (body.wakeTime !== undefined) {
    if (parseClock(body.wakeTime) === null) return c.json({ error: "Use HH:MM for wake time." }, 422);
    patch.wakeTime = body.wakeTime;
  }
  if (body.bedtime !== undefined) {
    if (parseClock(body.bedtime) === null) return c.json({ error: "Use HH:MM for bedtime." }, 422);
    patch.bedtime = body.bedtime;
  }
  const numbers = [
    ["maxDailyStudyMinutes", 30, 720],
    ["preferredSessionMinutes", 15, 180],
    ["breakMinutes", 0, 60],
  ] as const;
  for (const [key, min, max] of numbers) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value)) return c.json({ error: "Use a number of minutes." }, 422);
    patch[key] = Math.min(max, Math.max(min, Math.round(value)));
  }

  // Written only once everything has validated, so a bad field changes nothing.
  if (patch.displayName) {
    await database
      .update(schema.users)
      .set({ name: patch.displayName })
      .where(eq(schema.users.id, userId));
  }
  if (Object.keys(patch).length > 0) {
    await database.update(schema.profiles).set(patch).where(eq(schema.profiles.userId, userId));
  }

  // Year level sets the default weekly targets; the routine bounds the plan.
  const planInputs: (keyof ProfileBody)[] = [
    "grade",
    "wakeTime",
    "bedtime",
    "maxDailyStudyMinutes",
    "preferredSessionMinutes",
    "breakMinutes",
  ];
  if (planInputs.some((key) => body[key] !== undefined)) await replan(database, userId);

  return c.json(await buildProfile(database, userId));
});

export default profile;
