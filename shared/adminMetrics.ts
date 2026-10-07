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
  /** From ai_usage. Includes developers: it's real spend. */
  ai: {
    costMicros: PeriodCount;
    calls: number;
    byFeature: AiSpendRow[];
    byTier: AiSpendRow[];
    series: Array<{ day: string; costMicros: number }>;
  };
}

/**
 * Money and traffic for /app/admin, from the services that own them: Stripe
 * and RevenueCat for who is actually paying (no test or sandbox purchases),
 * PostHog for visitors and where they came from. Each part is null when its
 * service isn't connected or didn't answer, with the reason in `errors`.
 */
export interface AdminBusiness {
  generatedAt: string;
  days: MetricPeriod;
  money: AdminMoney | null;
  traffic: AdminTraffic | null;
  /** Onboarding's "How did you hear about Arcadia?" for accounts made this period. */
  heardFrom: AdminHeardFromRow[];
  errors: string[];
}

export interface AdminHeardFromRow {
  /** shared/heardFrom.ts key, or null for accounts made before the question. */
  answer: string | null;
  /** The creator's handle or the student's words; null when they gave none. */
  detail: string | null;
  signups: number;
  /** Real paying customers now; null when Stripe and RevenueCat couldn't be read. */
  paying: number | null;
}

export interface AdminMoney {
  /** Monthly recurring revenue at today's prices after discounts, A$ cents. */
  mrrCents: number;
  /** MRR from web (Stripe) and App Store subscribers, A$ cents, before fees. */
  mrrStripeCents: number;
  mrrAppStoreCents: number;
  paying: {
    total: number;
    stripe: number;
    appStore: number;
    pro: number;
    max: number;
    /** Will not renew: cancelled at period end, or auto-renew off. */
    cancelling: number;
    pastDue: number;
    /** Accounts made this period that pay now. */
    newThisPeriod: number;
  };
  /** App Store test purchases (sandbox, TestFlight), left out of the above. */
  sandbox: number;
  /** Stripe money that moved this period, A$ cents. */
  stripeCash: {
    grossCents: number;
    feesCents: number;
    refundsCents: number;
    netCents: number;
    series: Array<{ day: string; netCents: number }>;
  };
  /** Paying subscriptions by plan and billing period. */
  plans: Array<{ key: string; count: number; mrrCents: number }>;
}

export interface AdminTrafficSource {
  source: string;
  visitors: number;
  signups: number;
  paid: number;
}

export interface AdminTraffic {
  visitors: number;
  pageviews: number;
  sessions: number;
  series: Array<{ day: string; visitors: number }>;
  sources: AdminTrafficSource[];
  countries: Array<{ key: string; visitors: number }>;
  platforms: Array<{ key: string; visitors: number }>;
}
