-- Today as a note. Untimed lines typed into "Add to today..." ("Call with
-- Pari", "Practising interview rest of night") live here, one row per line
-- on a local day. Timed lines ("SLC 10:50") become ordinary events with
-- source 'note', so the timeline and the planner see them.
CREATE TABLE day_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  text TEXT NOT NULL,
  subject TEXT,
  note TEXT NOT NULL DEFAULT '',
  evening INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX day_items_user_day_idx ON day_items(user_id, day);
--> statement-breakpoint
-- The sub-bullet under a line in the day note ("- ask about the internship").
ALTER TABLE events ADD COLUMN note TEXT NOT NULL DEFAULT '';
