-- When the scheduler last asked for a new layout. The cron waits for the
-- student's week to stop changing before asking Arcad, so a burst of edits
-- costs one layout rather than one each.
ALTER TABLE day_layouts ADD COLUMN wanted_at integer;
--> statement-breakpoint
-- Tokens and estimated cost of every call to the AI provider, by feature and
-- model. The user is kept only to break spend down by student and tier.
CREATE TABLE ai_usage (
  id text PRIMARY KEY NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text NOT NULL,
  service_tier text,
  input_tokens integer NOT NULL DEFAULT 0,
  cached_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  reasoning_tokens integer NOT NULL DEFAULT 0,
  cost_micros integer,
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX ai_usage_created_idx ON ai_usage(created_at);
--> statement-breakpoint
CREATE INDEX ai_usage_feature_created_idx ON ai_usage(feature, created_at);
--> statement-breakpoint
CREATE INDEX ai_usage_user_created_idx ON ai_usage(user_id, created_at);
