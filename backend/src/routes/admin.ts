import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { DAY } from "../lib/time";
import {
  METRIC_PERIODS,
  type AdminDay,
  type AdminMetrics,
  type AiSpendRow,
  type MetricPeriod,
  type PeriodCount,
  type RetentionCohort,
} from "../../../shared/adminMetrics";
import type { Env, Variables } from "../types";

/**
 * Developer-only numbers for /app/admin, read straight from D1. Aggregates
 * only: no names, emails or per-student rows leave this route. Developer
 * accounts are left out of every count except AI spend, which is real money.
 */
const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

admin.use("*", async (c, next) => {
  const { userId } = c.get("session");
  const [user] = await db(c.env.DB)
    .select({ developerAccess: schema.users.developerAccess })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user?.developerAccess) return c.json({ error: "Developer access required." }, 403);
  await next();
});

const STUDENT = "u.developer_access = 0";
const NOT_GUEST = "u.email NOT LIKE '%@arcadia.local'";
const RETENTION_WEEKS = 8;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Each usage count: rows from `from` (aliased t, with a user_id) timed by `at`. */
const USAGE: Record<keyof AdminMetrics["usage"], { from: string; at: string; value?: string; where?: string }> = {
  focusMinutes: { from: "study_sessions t", at: "t.ended_at", value: "t.seconds / 60.0", where: "t.type != 'break'" },
  focusSessions: { from: "study_sessions t", at: "t.ended_at", where: "t.type != 'break'" },
  arcadMessages: { from: "messages t", at: "t.created_at", where: "t.role = 'user'" },
  decksCreated: { from: "decks t", at: "t.created_at" },
  cardsReviewed: { from: "cards t", at: "t.reviewed_at" },
  sheetsCreated: { from: "sheets t", at: "t.created_at" },
  filesAdded: {
    from: "(SELECT user_id, created_at FROM subject_files UNION ALL SELECT user_id, created_at FROM uploads) t",
    at: "t.created_at",
  },
  roomJoins: { from: "study_room_members t", at: "t.joined_at" },
  tasksCompleted: { from: "tasks t", at: "t.completed_at" },
  feedback: { from: "feedback t", at: "t.created_at" },
};

/** ?1 is the start of this period, ?2 the start of the one before. */
function usageSql({ from, at, value = "1", where }: (typeof USAGE)[keyof typeof USAGE]): string {
  return `SELECT
      COALESCE(SUM(CASE WHEN ${at} >= ?1 THEN ${value} END), 0) AS current,
      COALESCE(SUM(CASE WHEN ${at} < ?1 THEN ${value} END), 0) AS previous
    FROM ${from} JOIN users u ON u.id = t.user_id
    WHERE ${STUDENT} AND ${at} >= ?2${where ? ` AND ${where}` : ""}`;
}

function periodCount(row: Record<string, unknown> | undefined): PeriodCount {
  return { current: Math.round(Number(row?.current ?? 0)), previous: Math.round(Number(row?.previous ?? 0)) };
}

admin.get("/metrics", async (c) => {
  const requested = Number(c.req.query("days") ?? 30);
  const days: MetricPeriod = (METRIC_PERIODS as readonly number[]).includes(requested) ? (requested as MetricPeriod) : 30;
  const now = Date.now();
  const today = utcDay(now);
  const firstDay = utcDay(dayMs(today) - (days - 1) * DAY);
  const since = dayMs(firstDay);
  const previousSince = since - days * DAY;
  const cohortStart = mondayOf(dayMs(today)) - (RETENTION_WEEKS - 1) * 7 * DAY;
  const d1 = c.env.DB;

  const usageKeys = Object.keys(USAGE) as Array<keyof typeof USAGE>;
  const [usersRow, developersRow, activeRow, funnelRow, activeDays, signupDays, focusDays, cohortUsers, cohortActivity, ...usageRows] =
    await d1.batch<Record<string, unknown>>([
      d1.prepare(`SELECT
          COUNT(*) AS total,
          COALESCE(SUM(${NOT_GUEST} AND u.email_verified = 1), 0) AS verified,
          COALESCE(SUM(u.email LIKE '%@arcadia.local'), 0) AS guests,
          COALESCE(SUM(${NOT_GUEST} AND u.created_at >= ?1), 0) AS signups_current,
          COALESCE(SUM(${NOT_GUEST} AND u.created_at >= ?2 AND u.created_at < ?1), 0) AS signups_previous,
          COALESCE(SUM(u.tier = 'free'), 0) AS free,
          COALESCE(SUM(u.tier = 'pro'), 0) AS pro,
          COALESCE(SUM(u.tier = 'max'), 0) AS max,
          COALESCE(SUM(u.tier IN ('pro', 'max') AND u.billing_provider = 'stripe'), 0) AS stripe,
          COALESCE(SUM(u.tier IN ('pro', 'max') AND u.billing_provider = 'app_store'), 0) AS app_store,
          COALESCE(SUM(u.subscription_status = 'past_due'), 0) AS past_due,
          COALESCE(SUM(u.tier = 'free' AND u.pro_bonus_until > ?3), 0) AS referral_pro
        FROM users u WHERE ${STUDENT}`).bind(since, previousSince, now),
      d1.prepare("SELECT COUNT(*) AS developers FROM users WHERE developer_access = 1"),
      d1.prepare(`SELECT
          COUNT(DISTINCT CASE WHEN a.day = ?1 THEN a.user_id END) AS today,
          COUNT(DISTINCT CASE WHEN a.day >= ?2 THEN a.user_id END) AS week,
          COUNT(DISTINCT a.user_id) AS month
        FROM user_active_days a JOIN users u ON u.id = a.user_id
        WHERE ${STUDENT} AND a.day >= ?3`).bind(today, utcDay(dayMs(today) - 6 * DAY), utcDay(dayMs(today) - 29 * DAY)),
      d1.prepare(`SELECT
          COUNT(*) AS signed_up,
          COALESCE(SUM(u.email_verified), 0) AS verified,
          COALESCE(SUM(p.onboarding_complete), 0) AS onboarded,
          COALESCE(SUM(EXISTS (SELECT 1 FROM study_sessions s WHERE s.user_id = u.id AND s.type != 'break')), 0) AS focused,
          COALESCE(SUM(EXISTS (
            SELECT 1 FROM user_active_days a
            WHERE a.user_id = u.id AND a.day > date(u.created_at / 1000, 'unixepoch')
          )), 0) AS returned,
          COALESCE(SUM(u.tier IN ('pro', 'max')), 0) AS paid
        FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE ${STUDENT} AND ${NOT_GUEST} AND u.created_at >= ?1`).bind(since),
      d1.prepare(`SELECT a.day, COUNT(*) AS n FROM user_active_days a JOIN users u ON u.id = a.user_id
        WHERE ${STUDENT} AND a.day >= ?1 GROUP BY a.day`).bind(firstDay),
      d1.prepare(`SELECT date(u.created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM users u
        WHERE ${STUDENT} AND ${NOT_GUEST} AND u.created_at >= ?1 GROUP BY day`).bind(since),
      d1.prepare(`SELECT date(t.ended_at / 1000, 'unixepoch') AS day, SUM(t.seconds) / 60.0 AS n
        FROM study_sessions t JOIN users u ON u.id = t.user_id
        WHERE ${STUDENT} AND t.type != 'break' AND t.ended_at >= ?1 GROUP BY day`).bind(since),
      d1.prepare(`SELECT u.id, date(u.created_at / 1000, 'unixepoch') AS day FROM users u
        WHERE ${STUDENT} AND ${NOT_GUEST} AND u.created_at >= ?1`).bind(cohortStart),
      d1.prepare(`SELECT a.user_id, a.day FROM user_active_days a JOIN users u ON u.id = a.user_id
        WHERE ${STUDENT} AND ${NOT_GUEST} AND u.created_at >= ?1 AND a.day >= ?2`).bind(cohortStart, utcDay(cohortStart)),
      ...usageKeys.map((key) => d1.prepare(usageSql(USAGE[key])).bind(since, previousSince)),
    ]);

  const users = usersRow.results[0] ?? {};
  const funnel = funnelRow.results[0] ?? {};
  const active = activeRow.results[0] ?? {};
  const num = (row: Record<string, unknown>, key: string) => Number(row[key] ?? 0);

  const byDay = (rows: Record<string, unknown>[]) => new Map(rows.map((row) => [String(row.day), Number(row.n ?? 0)]));
  const activeByDay = byDay(activeDays.results);
  const signupsByDay = byDay(signupDays.results);
  const focusByDay = byDay(focusDays.results);
  const series: AdminDay[] = [];
  for (let at = since; at <= dayMs(today); at += DAY) {
    const day = utcDay(at);
    series.push({
      day,
      active: activeByDay.get(day) ?? 0,
      signups: signupsByDay.get(day) ?? 0,
      focusMinutes: Math.round(focusByDay.get(day) ?? 0),
    });
  }

  const usage = Object.fromEntries(usageKeys.map((key, index) => [key, periodCount(usageRows[index]?.results[0])])) as AdminMetrics["usage"];

  const body: AdminMetrics = {
    generatedAt: new Date(now).toISOString(),
    days,
    users: {
      total: num(users, "total"),
      verified: num(users, "verified"),
      guests: num(users, "guests"),
      developers: num(developersRow.results[0] ?? {}, "developers"),
      signups: { current: num(users, "signups_current"), previous: num(users, "signups_previous") },
    },
    active: { today: num(active, "today"), week: num(active, "week"), month: num(active, "month") },
    plans: {
      free: num(users, "free"),
      pro: num(users, "pro"),
      max: num(users, "max"),
      stripe: num(users, "stripe"),
      appStore: num(users, "app_store"),
      pastDue: num(users, "past_due"),
      referralPro: num(users, "referral_pro"),
    },
    funnel: {
      signedUp: num(funnel, "signed_up"),
      verified: num(funnel, "verified"),
      onboarded: num(funnel, "onboarded"),
      focused: num(funnel, "focused"),
      returned: num(funnel, "returned"),
      paid: num(funnel, "paid"),
    },
    usage,
    series,
    retention: retentionCohorts(
      cohortUsers.results as Array<{ id: string; day: string }>,
      cohortActivity.results as Array<{ user_id: string; day: string }>,
      cohortStart,
      dayMs(today),
    ),
    ai: await aiSpend(d1, since, previousSince, firstDay),
  };

  c.header("cache-control", "private, no-store");
  return c.json(body);
});

function mondayOf(ms: number): number {
  const weekday = (new Date(ms).getUTCDay() + 6) % 7;
  return ms - weekday * DAY;
}

/**
 * Signup-week cohorts: of the students who signed up in a calendar week, the
 * share active in each later week. A week that hasn't finished yet is null,
 * so a half-over week never reads as a drop.
 */
function retentionCohorts(
  signups: Array<{ id: string; day: string }>,
  activity: Array<{ user_id: string; day: string }>,
  firstWeek: number,
  today: number,
): RetentionCohort[] {
  const activeWeeks = new Map<string, Set<number>>();
  for (const row of activity) {
    const weeks = activeWeeks.get(row.user_id) ?? new Set<number>();
    weeks.add(mondayOf(dayMs(row.day)));
    activeWeeks.set(row.user_id, weeks);
  }

  const cohorts: RetentionCohort[] = [];
  for (let week = firstWeek; week <= today; week += 7 * DAY) {
    const members = signups.filter((user) => mondayOf(dayMs(user.day)) === week);
    const weeks: Array<number | null> = [];
    for (let offset = 1; week + offset * 7 * DAY <= today; offset++) {
      const start = week + offset * 7 * DAY;
      if (start + 7 * DAY > today) {
        weeks.push(null);
        break;
      }
      const returned = members.filter((user) => activeWeeks.get(user.id)?.has(start)).length;
      weeks.push(members.length ? returned / members.length : 0);
    }
    cohorts.push({ week: utcDay(week), size: members.length, weeks });
  }
  return cohorts.reverse();
}

async function aiSpend(d1: D1Database, since: number, previousSince: number, firstDay: string): Promise<AdminMetrics["ai"]> {
  const [totals, features, tiers, days] = await d1.batch<Record<string, unknown>>([
    d1.prepare(`SELECT
        COALESCE(SUM(CASE WHEN created_at >= ?1 THEN cost_micros END), 0) AS current,
        COALESCE(SUM(CASE WHEN created_at < ?1 THEN cost_micros END), 0) AS previous,
        COALESCE(SUM(created_at >= ?1), 0) AS calls
      FROM ai_usage WHERE created_at >= ?2`).bind(since, previousSince),
    d1.prepare(`SELECT feature AS key, COUNT(*) AS calls, COALESCE(SUM(cost_micros), 0) AS cost
      FROM ai_usage WHERE created_at >= ?1 GROUP BY feature ORDER BY cost DESC`).bind(since),
    d1.prepare(`SELECT
        CASE WHEN u.id IS NULL THEN 'deleted' WHEN u.developer_access = 1 THEN 'developer' ELSE u.tier END AS key,
        COUNT(*) AS calls, COALESCE(SUM(a.cost_micros), 0) AS cost
      FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.created_at >= ?1 GROUP BY key ORDER BY cost DESC`).bind(since),
    d1.prepare(`SELECT date(created_at / 1000, 'unixepoch') AS day, COALESCE(SUM(cost_micros), 0) AS cost
      FROM ai_usage WHERE created_at >= ?1 GROUP BY day`).bind(dayMs(firstDay)),
  ]);
  const rows = (result: D1Result<Record<string, unknown>>): AiSpendRow[] =>
    result.results.map((row) => ({ key: String(row.key), calls: Number(row.calls ?? 0), costMicros: Number(row.cost ?? 0) }));
  const total = totals.results[0] ?? {};
  return {
    costMicros: periodCount(total),
    calls: Number(total.calls ?? 0),
    byFeature: rows(features),
    byTier: rows(tiers),
    series: days.results.map((row) => ({ day: String(row.day), costMicros: Number(row.cost ?? 0) })),
  };
}

export default admin;
