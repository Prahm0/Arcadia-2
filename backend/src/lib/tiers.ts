/**
 * Tier + daily-cap plumbing for Arcad. The `users.tier` column is the
 * source of truth (the Stripe webhook keeps it in sync); we count sent
 * messages per user per day in `arcad_usage` and reject a send once the
 * cap is hit. Free = 2/day, Pro = 20/day, Max = 100/day.
 */

import { and, eq, sql } from "drizzle-orm";
import type { db as makeDb } from "../db";
import { schema } from "../db";

export type Tier = "free" | "pro" | "max";

export const DAILY_MESSAGE_CAP: Record<Tier, number> = {
  free: 2,
  pro: 20,
  max: 100,
};

/**
 * How many flashcard decks each tier can keep. Free gets a taste, Pro a
 * handful, Max is unlimited (Infinity never trips the >= check). Flashcards
 * are the first of Max's "learning layer" features; storage is cheap, so
 * these limits are about tiering, not cost.
 */
export const DECK_LIMIT: Record<Tier, number> = {
  free: 1,
  pro: 3,
  max: Number.POSITIVE_INFINITY,
};

/**
 * UTC calendar day as `YYYY-MM-DD`. UTC (not local) keeps the cap
 * predictable regardless of where the user lives — otherwise a Sydney
 * user's "day" flips 14 hours before a New York user's, and a message
 * cap resets at unrelated moments per timezone.
 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidTier(value: string | null | undefined): value is Tier {
  return value === "free" || value === "pro" || value === "max";
}

export function isPaidTier(tier: Tier): boolean {
  return tier === "pro" || tier === "max";
}

export async function getUserTier(
  database: ReturnType<typeof makeDb>,
  userId: string,
): Promise<Tier> {
  const [user] = await database
    .select({ tier: schema.users.tier })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return isValidTier(user?.tier) ? user.tier : "free";
}

export interface CapCheckResult {
  allowed: boolean;
  tier: Tier;
  used: number;
  cap: number;
}

/**
 * Atomically bumps the day's counter for this user, then compares to
 * the tier cap. If we're over, we refund the bump so a subsequent
 * message-cap increase (upgrade) sees an accurate count. Small race
 * window between two concurrent sends can allow one extra message on
 * the boundary; that's acceptable for a soft-cap product experience.
 */
export async function tryConsumeMessage(
  database: ReturnType<typeof makeDb>,
  userId: string,
  tier: Tier,
): Promise<CapCheckResult> {
  const cap = DAILY_MESSAGE_CAP[tier];
  const day = todayUtc();

  const [row] = await database
    .insert(schema.arcadUsage)
    .values({ userId, day, count: 1 })
    .onConflictDoUpdate({
      target: [schema.arcadUsage.userId, schema.arcadUsage.day],
      set: { count: sql`${schema.arcadUsage.count} + 1` },
    })
    .returning({ count: schema.arcadUsage.count });

  const used = row?.count ?? 1;
  if (used > cap) {
    // Refund so the counter reflects actual delivered messages, not
    // rejected attempts. Also stops the number climbing endlessly for
    // someone spamming the endpoint after they've been capped.
    await database
      .update(schema.arcadUsage)
      .set({ count: sql`${schema.arcadUsage.count} - 1` })
      .where(
        and(
          eq(schema.arcadUsage.userId, userId),
          eq(schema.arcadUsage.day, day),
        ),
      );
    return { allowed: false, tier, used: cap, cap };
  }
  return { allowed: true, tier, used, cap };
}
