import type { Env } from "../types";
import type { Tier } from "./tiers";

const REVENUECAT_API = "https://api.revenuecat.com/v1";

export interface RevenueCatEntitlement {
  expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
}

export interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatEntitlement>;
}

interface RevenueCatSubscriberResponse {
  subscriber?: RevenueCatSubscriber;
}

export interface ActiveRevenueCatEntitlement {
  tier: Extract<Tier, "pro" | "max">;
  entitlement: string;
  productId: string | null;
  expiresAt: number | null;
}

/**
 * RevenueCat's v1 subscriber endpoint is the server-side source of truth.
 * The iOS SDK reports purchases to RevenueCat, but the browser never tells us
 * which tier to grant.
 */
export async function fetchRevenueCatSubscriber(env: Env, appUserId: string): Promise<RevenueCatSubscriber> {
  if (!env.REVENUECAT_SECRET_API_KEY) throw new Error("REVENUECAT_SECRET_API_KEY missing on Worker.");
  const response = await fetch(`${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: {
      authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
      accept: "application/json",
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`RevenueCat ${response.status}: subscriber lookup failed.`);
  const parsed = JSON.parse(body) as RevenueCatSubscriberResponse;
  return parsed.subscriber ?? {};
}

/** Highest active entitlement wins if a transition briefly leaves both present. */
export function activeRevenueCatEntitlement(
  env: Env,
  subscriber: RevenueCatSubscriber,
  now = Date.now(),
): ActiveRevenueCatEntitlement | null {
  const candidates: Array<{ tier: Extract<Tier, "pro" | "max">; entitlement: string }> = [
    { tier: "max", entitlement: env.REVENUECAT_ENTITLEMENT_MAX },
    { tier: "pro", entitlement: env.REVENUECAT_ENTITLEMENT_PRO },
  ];

  for (const candidate of candidates) {
    if (!candidate.entitlement) continue;
    const value = subscriber.entitlements?.[candidate.entitlement];
    if (!value) continue;
    const expiresAt = value.expires_date ? Date.parse(value.expires_date) : null;
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now)) continue;
    return {
      tier: candidate.tier,
      entitlement: candidate.entitlement,
      productId: value.product_identifier ?? null,
      expiresAt,
    };
  }
  return null;
}
