-- Priorities: a nested list (Area > Subject > Task), like a Notes outline.
-- Rows are stored in outline order (position) with a parent; the page saves
-- the whole outline at once. subject is the student's subject the item sits
-- under, matched on the device; free study time shows the top open one.
CREATE TABLE priorities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL DEFAULT '',
  subject TEXT,
  due_on TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX priorities_user_idx ON priorities(user_id, position);
