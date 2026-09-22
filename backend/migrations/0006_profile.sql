-- Profile page: who the student is, what they're aiming for, and what Arcad
-- should know about them.

-- Identity shown on the profile header. Avatar is initials on this colour
-- until photo uploads land.
ALTER TABLE profiles ADD COLUMN state TEXT;
ALTER TABLE profiles ADD COLUMN school TEXT;
ALTER TABLE profiles ADD COLUMN avatar_colour TEXT;

-- Goals: an ATAR target (0-99.95) alongside the free-form goals table below.
ALTER TABLE profiles ADD COLUMN atar_target REAL;

-- Arcad personalisation, the two "custom instructions" fields, and whether
-- Arcad may save memories from chats.
ALTER TABLE profiles ADD COLUMN arcad_about TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN arcad_style TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN memory_enabled INTEGER NOT NULL DEFAULT 1;

-- Per subject: the grade the student is aiming for, and a note Arcad reads
-- whenever it plans or talks about that subject.
ALTER TABLE subjects ADD COLUMN target_grade TEXT;
ALTER TABLE subjects ADD COLUMN notes TEXT NOT NULL DEFAULT '';

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX goals_user_idx ON goals (user_id);

-- Facts Arcad saves from chats (or the student adds), shown on the profile
-- where they can be deleted.
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'chat',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX memories_user_idx ON memories (user_id, created_at);
