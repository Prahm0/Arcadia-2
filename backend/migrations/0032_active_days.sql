-- One row per student per UTC day they used the app, for daily, weekly and
-- monthly actives and signup-week retention on the developer metrics page.
-- The dashboard load adds today's row; nothing else writes here.
CREATE TABLE user_active_days (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day text NOT NULL,
  PRIMARY KEY (user_id, day)
);
--> statement-breakpoint
CREATE INDEX user_active_days_day_idx ON user_active_days(day);
--> statement-breakpoint
-- Backfill from what was already recorded: focus sessions, messages to
-- Arcad, XP awards and sign-ins. messages.user_id has no foreign key, so rows
-- for deleted accounts are filtered out rather than inserted.
INSERT OR IGNORE INTO user_active_days (user_id, day)
SELECT user_id, day FROM (
  SELECT user_id, date(ended_at / 1000, 'unixepoch') AS day FROM study_sessions
  UNION SELECT user_id, date(created_at / 1000, 'unixepoch') FROM messages WHERE role = 'user'
  UNION SELECT user_id, date(created_at / 1000, 'unixepoch') FROM xp_events
  UNION SELECT user_id, date(created_at / 1000, 'unixepoch') FROM sessions
)
WHERE user_id IN (SELECT id FROM users);
