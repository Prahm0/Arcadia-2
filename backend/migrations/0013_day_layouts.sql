-- Arcad's day-by-day layout of the next week's study blocks (one row per
-- student). The scheduler places these blocks first and fills any gaps with
-- its own rules. When the inputs change (a new deadline, a new day) the
-- scheduler sets wanted_key and the cron asks Arcad for a fresh layout.
CREATE TABLE day_layouts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout TEXT,
  inputs_key TEXT,
  wanted_key TEXT,
  working_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX day_layouts_wanted_idx ON day_layouts (wanted_key);
