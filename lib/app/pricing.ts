/**
 * Pro's prices in AUD, shared by the pricing page and upgrade prompts. The
 * App Store charges the same (set in App Store Connect). Free and Pro are the
 * only plans on sale: weekly billing and Max were retired, and anyone already
 * on them keeps what they have.
 */
export const PAID_PRICING = {
  pro: { monthly: 6.99, yearly: 29.99 },
} as const;

export type PaidTier = keyof typeof PAID_PRICING;

/** Yearly Pro as a monthly amount: 29.99 / 12 = 2.50. */
export const PRO_YEARLY_PER_MONTH = Math.round((PAID_PRICING.pro.yearly / 12) * 100) / 100;

/** How much cheaper yearly is than paying monthly for a year, in whole percent. */
export const PRO_YEARLY_SAVING = Math.round((1 - PAID_PRICING.pro.yearly / (PAID_PRICING.pro.monthly * 12)) * 100);

/** "A$6.99", or "A$30" for whole amounts. */
export function aud(amount: number): string {
  return `A$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

/**
 * What each plan includes, shared by the in-app pricing page and the landing
 * page so the two can't drift apart. Caps match backend/src/lib/tiers.ts.
 */
export const TIER_COPY = {
  free: {
    headline: "Get organised, on your own.",
    features: [
      "Auto-scheduled daily plan",
      "Tasks & deadlines",
      "Session timer (Classic 25/5)",
      "Arcad, 3 messages a day",
      "1 flashcard deck",
      "Weekly review, text summary",
      "Study rooms for up to 12, with chat and room colours",
    ],
  },
  pro: {
    headline: "Your planner, study coach and focus app in one.",
    features: [
      "Everything in Free",
      "Arcad, 20 messages a day: it plans, explains and rebuilds your week",
      "Your school, Google, Apple and Canvas calendars in your plan",
      "Upload notes and PDFs, Arcad answers from them",
      "Block times for your apps, like Opal: night, after school, whenever you choose",
      "Study rooms for up to 30, with shared timers",
      "Room icon and shared 7-day focus goal",
      "Full analytics, subject breakdown, streaks, trends",
      "Custom focus presets",
      "Up to 3 flashcard decks",
    ],
  },
} as const;
