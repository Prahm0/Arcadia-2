export interface Env {
  DB: D1Database;
  // Optional until R2 is enabled on the account; uploads work without it,
  // they just don't keep the original file.
  UPLOADS?: R2Bucket;

  // vars (wrangler.jsonc)
  APP_ORIGIN: string;
  MAIL_FROM: string;
  OPENAI_MODEL: string;
  GOOGLE_SIGN_IN_ENABLED?: string;
  // Local dev only: point Arcad at a stand-in server instead of OpenAI.
  OPENAI_BASE_URL?: string;
  STRIPE_PRICE_PRO_WEEKLY: string;
  STRIPE_PRICE_PRO_MONTHLY: string;
  STRIPE_PRICE_PRO_YEARLY: string;
  STRIPE_PRICE_MAX_WEEKLY: string;
  STRIPE_PRICE_MAX_MONTHLY: string;
  STRIPE_PRICE_MAX_YEARLY: string;

  // secrets (wrangler secret put)
  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
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
