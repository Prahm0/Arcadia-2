CREATE TABLE calendar_exports (
  user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
  last_fetched_at integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX calendar_exports_token_idx ON calendar_exports(token);
