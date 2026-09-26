-- iPhone check-ins. The iOS app registers an APNs device token instead of a
-- browser push subscription. Environment is the APNs host the token belongs
-- to: Xcode builds get sandbox tokens, TestFlight and the App Store get
-- production ones. The per-type flags mirror push_subscriptions.
CREATE TABLE native_push_tokens (
  token TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'ios',
  environment TEXT NOT NULL DEFAULT 'production',
  checkins_enabled INTEGER NOT NULL DEFAULT 1,
  session_start_enabled INTEGER NOT NULL DEFAULT 1,
  late_start_enabled INTEGER NOT NULL DEFAULT 1,
  session_followup_enabled INTEGER NOT NULL DEFAULT 1,
  streak_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX native_push_tokens_user_idx ON native_push_tokens(user_id);
--> statement-breakpoint
-- Two new nudges, on for every existing browser subscription too: a block
-- that started ten minutes ago with no start, and a streak about to break.
ALTER TABLE push_subscriptions ADD COLUMN late_start_enabled INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE push_subscriptions ADD COLUMN streak_enabled INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
-- One row per check-in sent. The one-minute cron looks back far enough that
-- two runs can see the same block; the first insert wins and the second run
-- sends nothing. Rows older than two days are pruned by the cron.
CREATE TABLE push_deliveries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, dedupe_key)
);
--> statement-breakpoint
CREATE INDEX push_deliveries_sent_idx ON push_deliveries(sent_at);
