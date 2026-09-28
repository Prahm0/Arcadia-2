import type { AdminMoney, AdminTraffic, AdminTrafficSource } from "../../../shared/adminMetrics";
import type { Env } from "../types";
import { stripeCall } from "./stripe";
import { fetchRevenueCatSubscriber } from "./revenuecat";

/**
 * Money and traffic for /app/admin, read from the services that own them.
 * D1's `tier` says who has access, which includes test purchases, invite
 * Pro and old test accounts; these say who actually pays and who visits.
 */

const DAY = 86_400_000;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ────────── Stripe ──────────

interface StripeCoupon {
  percent_off?: number | null;
  amount_off?: number | null;
}

interface StripeDiscount {
  coupon?: StripeCoupon | string | null;
  source?: { coupon?: StripeCoupon | string | null } | null;
}

interface StripeSubscriptionRow {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  discounts?: Array<StripeDiscount | string>;
  items: {
    data: Array<{
      quantity?: number;
      price: {
        unit_amount: number | null;
        currency: string;
        lookup_key?: string | null;
        id: string;
        recurring?: { interval: "day" | "week" | "month" | "year"; interval_count: number } | null;
      };
    }>;
  };
}

interface StripeList<T> {
  data: T[];
  has_more: boolean;
}

interface BalanceTransaction {
  id: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  type: string;
  created: number;
}

/** Stripe statuses that still count as a paying customer. */
const PAYING_STATUSES = new Set(["active", "trialing", "past_due"]);
/** Balance moves that aren't revenue: money leaving to the bank and the like. */
const NOT_REVENUE = new Set(["payout", "payout_cancel", "payout_failure", "transfer", "transfer_cancel", "topup", "topup_reversal"]);

async function listAll<T extends { id: string }>(env: Env, path: string, pages = 10): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (let page = 0; page < pages; page++) {
    const joiner = path.includes("?") ? "&" : "?";
    const list: StripeList<T> = await stripeCall<StripeList<T>>(env, `${path}${joiner}limit=100${after ? `&starting_after=${after}` : ""}`);
    rows.push(...list.data);
    if (!list.has_more || list.data.length === 0) break;
    after = list.data[list.data.length - 1].id;
  }
  return rows;
}

/** Normalises one billing period's amount to a month. */
function monthly(cents: number, interval: string, count: number): number {
  const per = Math.max(1, count);
  if (interval === "week") return (cents * 52) / 12 / per;
  if (interval === "year") return cents / 12 / per;
  if (interval === "day") return (cents * 365) / 12 / per;
  return cents / per;
}

function couponOf(discount: StripeDiscount | string): StripeCoupon | null {
  if (typeof discount === "string") return null;
  const coupon = discount.source?.coupon ?? discount.coupon;
  return coupon && typeof coupon === "object" ? coupon : null;
}

/** The subscription's monthly amount after its discounts, in cents. */
function subscriptionMrr(sub: StripeSubscriptionRow): number {
  let cents = 0;
  for (const item of sub.items.data) {
    const recurring = item.price.recurring;
    if (!recurring || item.price.unit_amount === null) continue;
    cents += monthly(item.price.unit_amount * (item.quantity ?? 1), recurring.interval, recurring.interval_count);
  }
  for (const discount of sub.discounts ?? []) {
    const coupon = couponOf(discount);
    if (coupon?.percent_off) cents *= 1 - coupon.percent_off / 100;
    else if (coupon?.amount_off) cents = Math.max(0, cents - coupon.amount_off);
  }
  return cents;
}

async function stripeSubscriptions(env: Env): Promise<StripeSubscriptionRow[]> {
  const base = "/subscriptions?status=all&expand[]=data.discounts";
  try {
    return await listAll<StripeSubscriptionRow>(env, `${base}&expand[]=data.discounts.source.coupon`);
  } catch {
    // Older discount shapes can't expand source.coupon; the coupon then
    // arrives inline or not at all.
    return await listAll<StripeSubscriptionRow>(env, base);
  }
}

// ────────── App Store ──────────

interface RevenueCatSubscription {
  expires_date?: string | null;
  is_sandbox?: boolean;
  period_type?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  price?: { amount?: number; currency?: string } | null;
}

/** App Store list prices in A$, the fallback when RevenueCat sends no price. */
const APP_STORE_PRICES: Record<string, number> = {
  "pro.weekly": 4.99,
  "pro.monthly": 12.99,
  "pro.yearly": 49.99,
  "max.weekly": 9.99,
  "max.monthly": 29.99,
  "max.yearly": 199.99,
};
const APP_STORE_INTRO_PRO_MONTHLY = 6.99;
const APP_STORE_PERIOD = { weekly: "week", monthly: "month", yearly: "year" } as const;

/** "app.arcadiahq.arcadia.pro.monthly" → { tier: "pro", interval: "monthly" }. */
function appStorePlan(productId: string): { tier: "pro" | "max"; interval: "weekly" | "monthly" | "yearly" } | null {
  const match = /\b(pro|max)\.(weekly|monthly|yearly)$/.exec(productId);
  return match ? { tier: match[1] as "pro" | "max", interval: match[2] as "weekly" | "monthly" | "yearly" } : null;
}

// ────────── Money ──────────

export interface MoneyUser {
  id: string;
  createdAt: number;
  developer: boolean;
  stripeCustomerId: string | null;
  appStore: boolean;
}

/**
 * Who pays now and what that's worth a month, plus the Stripe cash that
 * moved this period. Developer accounts are left out, like everywhere else
 * on the page. `users` maps Stripe customers and App Store subscribers back
 * to accounts, for "new this period".
 */
export async function adminMoney(env: Env, users: MoneyUser[], since: number, now = Date.now()): Promise<AdminMoney> {
  const byCustomer = new Map(users.filter((u) => u.stripeCustomerId).map((u) => [u.stripeCustomerId as string, u]));
  const plans = new Map<string, { count: number; mrrCents: number }>();
  const addPlan = (key: string, mrrCents: number) => {
    const row = plans.get(key) ?? { count: 0, mrrCents: 0 };
    row.count += 1;
    row.mrrCents += mrrCents;
    plans.set(key, row);
  };
  const paying = { total: 0, stripe: 0, appStore: 0, pro: 0, max: 0, cancelling: 0, pastDue: 0, newThisPeriod: 0 };
  let mrrStripe = 0;
  let mrrAppStore = 0;
  let sandbox = 0;

  const [subscriptions, transactions] = await Promise.all([
    stripeSubscriptions(env),
    listAll<BalanceTransaction>(env, `/balance_transactions?created[gte]=${Math.floor(since / 1000)}`),
  ]);

  for (const sub of subscriptions) {
    if (!PAYING_STATUSES.has(sub.status)) continue;
    const user = byCustomer.get(sub.customer);
    if (user?.developer) continue;
    const mrr = subscriptionMrr(sub);
    const price = sub.items.data[0]?.price;
    const tier = /max/i.test(`${price?.lookup_key ?? ""} ${price?.id ?? ""}`) || isPrice(env, price?.id, "MAX") ? "max" : "pro";
    const interval = intervalName(price?.recurring?.interval);
    paying.total += 1;
    paying.stripe += 1;
    paying[tier] += 1;
    if (sub.status === "past_due") paying.pastDue += 1;
    if (sub.cancel_at_period_end || sub.cancel_at) paying.cancelling += 1;
    if (user && user.createdAt >= since) paying.newThisPeriod += 1;
    mrrStripe += mrr;
    addPlan(`${tier} ${interval} · web`, mrr);
  }

  const appStoreUsers = users.filter((u) => u.appStore && !u.developer);
  for (let index = 0; index < appStoreUsers.length; index += 10) {
    const chunk = appStoreUsers.slice(index, index + 10);
    const subscribers = await Promise.all(chunk.map((u) => fetchRevenueCatSubscriber(env, u.id).catch(() => null)));
    chunk.forEach((user, position) => {
      const entries = Object.entries(
        ((subscribers[position] as { subscriptions?: Record<string, RevenueCatSubscription> } | null)?.subscriptions) ?? {},
      );
      // One paying subscription per person: the one that runs longest.
      const live = entries
        .filter(([, sub]) => sub.expires_date && Date.parse(sub.expires_date) > now)
        .sort(([, a], [, b]) => Date.parse(b.expires_date ?? "") - Date.parse(a.expires_date ?? ""));
      if (live.length === 0) return;
      const [productId, sub] = live[0];
      if (sub.is_sandbox) {
        sandbox += 1;
        return;
      }
      const plan = appStorePlan(productId);
      if (!plan) return;
      const listed = sub.period_type === "intro" && plan.tier === "pro" && plan.interval === "monthly"
        ? APP_STORE_INTRO_PRO_MONTHLY
        : APP_STORE_PRICES[`${plan.tier}.${plan.interval}`] ?? 0;
      const amount = sub.price?.currency === "AUD" && typeof sub.price.amount === "number" ? sub.price.amount : listed;
      const mrr = monthly(Math.round(amount * 100), APP_STORE_PERIOD[plan.interval], 1);
      paying.total += 1;
      paying.appStore += 1;
      paying[plan.tier] += 1;
      if (sub.unsubscribe_detected_at) paying.cancelling += 1;
      if (sub.billing_issues_detected_at) paying.pastDue += 1;
      if (user.createdAt >= since) paying.newThisPeriod += 1;
      mrrAppStore += mrr;
      addPlan(`${plan.tier} ${plan.interval} · App Store`, mrr);
    });
  }

  const cash = { grossCents: 0, feesCents: 0, refundsCents: 0, netCents: 0 };
  const netByDay = new Map<string, number>();
  for (const move of transactions) {
    if (move.currency !== "aud" || NOT_REVENUE.has(move.type)) continue;
    if (move.type === "charge" || move.type === "payment") cash.grossCents += move.amount;
    if (move.type === "refund" || move.type === "payment_refund") cash.refundsCents -= move.amount;
    cash.netCents += move.net;
    const day = utcDay(move.created * 1000);
    netByDay.set(day, (netByDay.get(day) ?? 0) + move.net);
  }
  // Whatever isn't sales, refunds or net: Stripe's fees and the tax it keeps.
  cash.feesCents = cash.grossCents - cash.refundsCents - cash.netCents;
  const series: Array<{ day: string; netCents: number }> = [];
  for (let at = Date.parse(`${utcDay(since)}T00:00:00Z`); at <= now; at += DAY) {
    const day = utcDay(at);
    series.push({ day, netCents: netByDay.get(day) ?? 0 });
  }

  return {
    mrrCents: Math.round(mrrStripe + mrrAppStore),
    mrrStripeCents: Math.round(mrrStripe),
    mrrAppStoreCents: Math.round(mrrAppStore),
    paying,
    sandbox,
    stripeCash: { ...cash, series },
    plans: [...plans.entries()]
      .map(([key, row]) => ({ key, count: row.count, mrrCents: Math.round(row.mrrCents) }))
      .sort((a, b) => b.mrrCents - a.mrrCents),
  };
}

function isPrice(env: Env, id: string | undefined, tier: "PRO" | "MAX"): boolean {
  if (!id) return false;
  return (["WEEKLY", "MONTHLY", "YEARLY"] as const).some((interval) => env[`STRIPE_PRICE_${tier}_${interval}`] === id);
}

function intervalName(interval: string | undefined): string {
  if (interval === "week") return "weekly";
  if (interval === "year") return "yearly";
  if (interval === "day") return "daily";
  return "monthly";
}

// ────────── PostHog ──────────

/** PostHog's app host for the API; the ingest host (eu.i.posthog.com) doesn't serve queries. */
function posthogApiHost(env: Env): string {
  return (env.POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(".i.posthog.com", ".posthog.com").replace(/\/$/, "");
}

async function hogql(env: Env, query: string): Promise<unknown[][]> {
  const response = await fetch(`${posthogApiHost(env)}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!response.ok) throw new Error(`PostHog ${response.status}: query failed.`);
  const body = (await response.json()) as { results?: unknown[][] };
  return body.results ?? [];
}

export function posthogConnected(env: Env): boolean {
  return Boolean(env.POSTHOG_PERSONAL_API_KEY && env.POSTHOG_PROJECT_ID);
}

/**
 * Visitors, and where they came from. Visitors are credited to the source
 * their session started from (the utm_source on a creator's link, else the
 * referring site). Signups and payments are credited to the person's first
 * ever source, which PostHog keeps once they're identified. PostHog misses
 * visitors with ad blockers, so these are floors, not totals.
 */
export async function adminTraffic(env: Env, since: number): Promise<AdminTraffic> {
  const from = `timestamp >= toDateTime('${new Date(since).toISOString().slice(0, 19).replace("T", " ")}')`;
  const pageviews = `event = '$pageview' AND ${from}`;
  const sessionSource = "lower(coalesce(nullIf(session.$entry_utm_source, ''), nullIf(session.$entry_referring_domain, ''), '$direct'))";
  const personSource =
    "lower(coalesce(nullIf(person.properties.$initial_utm_source, ''), nullIf(person.properties.$initial_referring_domain, ''), '$direct'))";

  const [totals, days, visits, conversions, countries, platforms] = await Promise.all([
    hogql(env, `SELECT count(DISTINCT person_id), count(), count(DISTINCT $session_id) FROM events WHERE ${pageviews}`),
    hogql(env, `SELECT toString(toDate(timestamp)) AS day, count(DISTINCT person_id) FROM events WHERE ${pageviews} GROUP BY day ORDER BY day`),
    hogql(env, `SELECT ${sessionSource} AS source, count(DISTINCT person_id) AS visitors FROM events WHERE ${pageviews} GROUP BY source ORDER BY visitors DESC LIMIT 40`),
    hogql(env, `SELECT ${personSource} AS source,
        count(DISTINCT if(event = 'signup_completed', person_id, NULL)),
        count(DISTINCT if(event = 'subscription_activated', person_id, NULL))
      FROM events WHERE event IN ('signup_completed', 'subscription_activated') AND ${from} GROUP BY source`),
    hogql(env, `SELECT coalesce(properties.$geoip_country_code, '?') AS c, count(DISTINCT person_id) AS n FROM events WHERE ${pageviews} GROUP BY c ORDER BY n DESC LIMIT 12`),
    hogql(env, `SELECT coalesce(properties.platform, 'web') AS p, count(DISTINCT person_id) AS n FROM events WHERE ${pageviews} GROUP BY p ORDER BY n DESC`),
  ]);

  const sources = new Map<string, AdminTrafficSource>();
  const source = (key: unknown) => {
    const name = String(key ?? "$direct") || "$direct";
    let row = sources.get(name);
    if (!row) {
      row = { source: name, visitors: 0, signups: 0, paid: 0 };
      sources.set(name, row);
    }
    return row;
  };
  for (const [key, visitors] of visits) source(key).visitors = Number(visitors ?? 0);
  for (const [key, signups, paid] of conversions) {
    const row = source(key);
    row.signups = Number(signups ?? 0);
    row.paid = Number(paid ?? 0);
  }

  const visitorsByDay = new Map(days.map(([day, n]) => [String(day), Number(n ?? 0)]));
  const series: AdminTraffic["series"] = [];
  for (let at = Date.parse(`${utcDay(since)}T00:00:00Z`); at <= Date.now(); at += DAY) {
    const day = utcDay(at);
    series.push({ day, visitors: visitorsByDay.get(day) ?? 0 });
  }
  const [total] = totals;
  return {
    visitors: Number(total?.[0] ?? 0),
    pageviews: Number(total?.[1] ?? 0),
    sessions: Number(total?.[2] ?? 0),
    series,
    sources: [...sources.values()].sort((a, b) => b.paid - a.paid || b.signups - a.signups || b.visitors - a.visitors),
    countries: countries.map(([key, n]) => ({ key: String(key), visitors: Number(n ?? 0) })),
    platforms: platforms.map(([key, n]) => ({ key: String(key), visitors: Number(n ?? 0) })),
  };
}
