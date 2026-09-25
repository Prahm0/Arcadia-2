/**
 * The developer metrics page (/app/admin): business numbers read straight
 * from D1, for things PostHog can't see accurately (plans, AI spend) or
 * loses to ad blockers (activity). Counts leave out developer accounts.
 * Days are UTC dates (YYYY-MM-DD).
 */

export const METRIC_PERIODS = [7, 30, 90] as const;
export type MetricPeriod = (typeof METRIC_PERIODS)[number];

/** A count this period next to the same-length period before it. */
export interface PeriodCount {
  current: number;
  previous: number;
}

export interface AdminDay {
  day: string;
  active: number;
  signups: number;
  focusMinutes: number;
}

export interface RetentionCohort {
  /** Monday the signup week started. */
  week: string;
  size: number;
  /** Share (0–1) active in week 1, 2, …; null for weeks that haven't finished. */
  weeks: Array<number | null>;
}

export interface AiSpendRow {
  key: string;
  calls: number;
  costMicros: number;
}

export interface AdminMetrics {
  generatedAt: string;
  days: MetricPeriod;
  users: {
    total: number;
    verified: number;
    guests: number;
    developers: number;
    signups: PeriodCount;
  };
  active: { today: number; week: number; month: number };
  plans: {
    free: number;
    pro: number;
    max: number;
    stripe: number;
    appStore: number;
    pastDue: number;
    referralPro: number;
  };
  /** Accounts made this period (not guests), and how far each got. */
  funnel: {
    signedUp: number;
    verified: number;
    onboarded: number;
    focused: number;
    returned: number;
    paid: number;
  };
  usage: {
    focusMinutes: PeriodCount;
    focusSessions: PeriodCount;
    arcadMessages: PeriodCount;
    decksCreated: PeriodCount;
    cardsReviewed: PeriodCount;
    sheetsCreated: PeriodCount;
    filesAdded: PeriodCount;
    roomJoins: PeriodCount;
    tasksCompleted: PeriodCount;
    feedback: PeriodCount;
  };
  series: AdminDay[];
  retention: RetentionCohort[];
  /** Null until the ai_usage table exists (PR #217). Includes developers: it's real spend. */
  ai: {
    costMicros: PeriodCount;
    calls: number;
    byFeature: AiSpendRow[];
    byTier: AiSpendRow[];
    series: Array<{ day: string; costMicros: number }>;
  } | null;
}
