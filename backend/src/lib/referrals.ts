import { and, eq, isNull, sql } from "drizzle-orm";
import type { db as makeDb } from "../db";
import { schema } from "../db";
import { newId } from "./ids";

export const REFERRAL_BONUS_DAYS = 7;
export const MAX_REFERRAL_BONUS_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 8;

type Database = ReturnType<typeof makeDb>;

export function normaliseReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return new RegExp(`^[${CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`).test(code) ? code : null;
}

function newReferralCode(): string {
  const bytes = new Uint8Array(REFERRAL_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

/** A code for a just-created user, checked before its insert. */
export async function createReferralCode(database: Database): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = newReferralCode();
    const [existing] = await database
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.referralCode, referralCode))
      .limit(1);
    if (!existing) return referralCode;
  }
  throw new Error("Could not create a referral code.");
}

/** Assign a code only once, so existing students receive a stable invite link. */
export async function ensureReferralCode(database: Database, userId: string): Promise<string> {
  const [existing] = await database
    .select({ referralCode: schema.users.referralCode })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = newReferralCode();
    try {
      const updated = await database
        .update(schema.users)
        .set({ referralCode })
        .where(and(eq(schema.users.id, userId), isNull(schema.users.referralCode)))
        .returning({ referralCode: schema.users.referralCode });
      if (updated[0]?.referralCode) return updated[0].referralCode;

      const [current] = await database
        .select({ referralCode: schema.users.referralCode })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (current?.referralCode) return current.referralCode;
    } catch {
      // A very unlikely unique-code collision. Generate a new one and retry.
    }
  }
  throw new Error("Could not create a referral code.");
}

/**
 * Records attribution only for a newly created, genuine account. Invalid or
 * self-supplied codes deliberately behave like no code, so the endpoint does
 * not become an oracle for active invite links.
 */
export async function createPendingReferral(
  database: Database,
  inviteeUserId: string,
  rawReferralCode: unknown,
): Promise<void> {
  const referralCode = normaliseReferralCode(rawReferralCode);
  if (!referralCode) return;

  const [referrer] = await database
    .select({ id: schema.users.id, email: schema.users.email, emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.referralCode, referralCode))
    .limit(1);
  if (!referrer || referrer.id === inviteeUserId || !referrer.emailVerified || referrer.email.endsWith("@arcadia.local")) {
    return;
  }

  await database.batch([
    database
      .update(schema.users)
      .set({ referredByUserId: referrer.id })
      .where(and(eq(schema.users.id, inviteeUserId), isNull(schema.users.referredByUserId))),
    database
      .insert(schema.referrals)
      .values({ id: newId("ref"), referrerUserId: referrer.id, inviteeUserId })
      .onConflictDoNothing(),
  ]);
}

async function grantProBonus(database: Database, userId: string, now: number): Promise<void> {
  // Keep this one SQL update so simultaneous onboarding completions cannot
  // overwrite each other's reward. The total bonus is capped for the life of
  // the account, not merely in its current active window.
  const remainingDays = sql`MIN(${REFERRAL_BONUS_DAYS}, MAX(0, ${MAX_REFERRAL_BONUS_DAYS} - ${schema.users.proBonusDaysEarned}))`;
  await database
    .update(schema.users)
    .set({
      proBonusUntil: sql`CASE
        WHEN ${schema.users.proBonusDaysEarned} >= ${MAX_REFERRAL_BONUS_DAYS} THEN ${schema.users.proBonusUntil}
        ELSE MAX(${now}, COALESCE(${schema.users.proBonusUntil}, 0)) + (${remainingDays} * ${DAY_MS})
      END`,
      proBonusDaysEarned: sql`MIN(${MAX_REFERRAL_BONUS_DAYS}, ${schema.users.proBonusDaysEarned} + ${REFERRAL_BONUS_DAYS})`,
    })
    .where(eq(schema.users.id, userId));
}

/** Qualify exactly once after a verified invitee has completed onboarding. */
export async function qualifyReferral(database: Database, inviteeUserId: string): Promise<boolean> {
  const [invitee] = await database
    .select({ email: schema.users.email, emailVerified: schema.users.emailVerified })
    .from(schema.users)
    .where(eq(schema.users.id, inviteeUserId))
    .limit(1);
  const [profile] = await database
    .select({ onboardingComplete: schema.profiles.onboardingComplete })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, inviteeUserId))
    .limit(1);
  if (!invitee?.emailVerified || invitee.email.endsWith("@arcadia.local") || !profile?.onboardingComplete) {
    return false;
  }

  const [qualified] = await database
    .update(schema.referrals)
    .set({ qualifiedAt: Date.now() })
    .where(and(eq(schema.referrals.inviteeUserId, inviteeUserId), isNull(schema.referrals.qualifiedAt)))
    .returning({ referrerUserId: schema.referrals.referrerUserId });
  if (!qualified) return false;

  const now = Date.now();
  await Promise.all([
    grantProBonus(database, qualified.referrerUserId, now),
    grantProBonus(database, inviteeUserId, now),
  ]);
  return true;
}

export function activeBonusDays(proBonusUntil: number | null | undefined, now = Date.now()): number {
  return Math.max(0, Math.ceil(((proBonusUntil ?? 0) - now) / DAY_MS));
}
