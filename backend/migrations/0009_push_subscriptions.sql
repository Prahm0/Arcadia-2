-- Browser push subscriptions are device-specific. Endpoint is the unique
-- browser capability URL, while the per-type flags let a student tune the
-- check-ins they receive without losing their subscription.
CREATE TABLE push_subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT PRIMARY KEY NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  checkins_enabled INTEGER NOT NULL DEFAULT 1,
  session_start_enabled INTEGER NOT NULL DEFAULT 1,
  session_followup_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);
