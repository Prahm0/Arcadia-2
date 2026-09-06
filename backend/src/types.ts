export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;

  // vars (wrangler.jsonc)
  APP_ORIGIN: string;
  MAIL_FROM: string;
  OPENAI_MODEL: string;

  // secrets (wrangler secret put)
  OPENAI_API_KEY?: string;
  RESEND_API_KEY?: string;
  TOKEN_ENCRYPTION_KEY?: string;
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  csrfToken: string;
}

export type Variables = {
  session: SessionContext;
};
