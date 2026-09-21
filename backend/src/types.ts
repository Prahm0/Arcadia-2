export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;

  // vars (wrangler.jsonc)
  APP_ORIGIN: string;
  MAIL_FROM: string;
  OPENAI_MODEL: string;
  STRIPE_PRICE_PRO_MONTHLY: string;
  STRIPE_PRICE_PRO_YEARLY: string;
  STRIPE_PRICE_MAX_MONTHLY: string;
  STRIPE_PRICE_MAX_YEARLY: string;

  // secrets (wrangler secret put)
  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  csrfToken: string;
}

export type Variables = {
  session: SessionContext;
};
