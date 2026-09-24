-- Summary sheets: one-page revision sheets the student writes, or has Arcad
-- draft from their own syllabus topics, files and decks. Sections are a
-- JSON array of { heading, body } with light Markdown in each body.

CREATE TABLE sheets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Like decks: removing a subject keeps its sheets under "No subject".
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  -- Topics are replaced when a syllabus is re-read, so the link just drops.
  topic_id TEXT REFERENCES subject_topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  sections TEXT NOT NULL DEFAULT '[]',
  -- 'manual' | 'arcad'
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX sheets_user_subject_idx ON sheets (user_id, subject_id);
