/** Paid-plan prices in AUD, shared by the pricing page and upgrade prompts. */
export const PAID_PRICING = {
  pro: { weekly: 4.95, monthly: 12.82, yearly: 49.4 },
  max: { weekly: 9.95, monthly: 34.54, yearly: 205.4 },
} as const;

export type PaidTier = keyof typeof PAID_PRICING;
