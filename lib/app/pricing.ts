/** Paid-plan prices in AUD, shared by the pricing page and upgrade prompts. */
export const PAID_PRICING = {
  pro: { weekly: 4.95, monthly: 12.82, yearly: 49.4 },
  max: { weekly: 9.95, monthly: 34.54, yearly: 205.4 },
} as const;

export type PaidTier = keyof typeof PAID_PRICING;

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
      "Arcad, 2 messages / day",
      "1 flashcard deck",
      "Weekly review, text summary",
      "Study rooms for up to 12, with chat and room colours",
    ],
  },
  pro: {
    headline: "Planning on autopilot, Arcad in the loop.",
    features: [
      "Everything in Free",
      "Arcad, 20 messages a day, 10x the free plan",
      "Google / Apple / Canvas calendar sync",
      "Upload PDFs & notes, Arcad answers from them",
      "Study rooms for up to 30, with shared timers",
      "Room icon and shared 7-day focus goal",
      "Full analytics, subject breakdown, streaks, trends",
      "Custom focus presets",
      "Up to 3 flashcard decks",
    ],
  },
  max: {
    headline: "The learning layer. Study, not just plan.",
    features: [
      "Everything in Pro",
      "Arcad, 100 messages a day, 50x the free plan",
      "Unlimited flashcard decks",
      "New study tools land here first",
      "Study rooms for up to 50",
    ],
  },
} as const;
