export interface Env {
  DB: D1Database;
  // Optional until R2 is enabled on the account; uploads work without it,
  // they just don't keep the original file.
  UPLOADS?: R2Bucket;

  // vars (wrangler.jsonc)
  APP_ORIGIN: string;
  MAIL_FROM: string;
  OPENAI_MODEL: string;
  // The model Arcad lays out the week's study blocks with. Falls back to OPENAI_MODEL.
  OPENAI_PLAN_MODEL?: string;
  // What Pro and Max students plan with (see lib/plan-tier.ts). Max falls back to Pro's.
  OPENAI_PLAN_MODEL_PRO?: string;
  OPENAI_PLAN_MODEL_MAX?: string;
  // Local dev only: point Arcad at a stand-in server instead of OpenAI.
  OPENAI_BASE_URL?: string;
  STRIPE_PRICE_PRO_WEEKLY: string;
  STRIPE_PRICE_PRO_MONTHLY: string;
  STRIPE_PRICE_PRO_YEARLY: string;
  STRIPE_PRICE_MAX_WEEKLY: string;
  STRIPE_PRICE_MAX_MONTHLY: string;
  STRIPE_PRICE_MAX_YEARLY: string;
  // Stripe coupon id for the onboarding win-back offer (e.g. 41% off Pro
  // monthly). Non-secret. Empty until a coupon is created in Stripe; the
  // win-back checkout then just runs at full price.
  STRIPE_WINBACK_COUPON_ID?: string;
  REVENUECAT_ENTITLEMENT_PRO: string;
  REVENUECAT_ENTITLEMENT_MAX: string;
  APPLE_BUNDLE_ID: string;
  // PostHog project key and host for server-side events (lib/posthog.ts).
  // The key is the same public one the browser ships with.
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;

  // secrets (wrangler secret put)
  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_SIGN_IN_ENABLED?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  REVENUECAT_SECRET_API_KEY?: string;
  REVENUECAT_WEBHOOK_AUTHORIZATION?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  csrfToken: string;
}

export type Variables = {
  session: SessionContext;
};
