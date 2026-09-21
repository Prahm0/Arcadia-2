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
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_AUTH_CLIENT_ID?: string;
  GOOGLE_AUTH_CLIENT_SECRET?: string;
  DEV_AUTH_TOKENS?: string;
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  csrfToken: string;
  transport: "cookie" | "bearer";
}

export type Variables = {
  session: SessionContext;
};
