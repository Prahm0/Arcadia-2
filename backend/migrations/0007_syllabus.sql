-- Syllabus and resources per subject. Arcad reads each file once and keeps
-- what matters here; the original file is only stored when R2 is switched on
-- (storage_key is set then).

CREATE TABLE subject_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  -- 'syllabus' (one per subject) or 'resource' (textbooks, notes, handouts)
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  storage_key TEXT,
  -- What Arcad took from it: for a resource, what it covers and its sections.
  summary TEXT NOT NULL DEFAULT '',
  -- 'read', or 'unread' when Arcad couldn't read it (the student fills in by hand)
  status TEXT NOT NULL DEFAULT 'read',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX subject_files_subject_idx ON subject_files (subject_id);

-- The topic map: what's taught when. Dates are local calendar dates.
CREATE TABLE subject_topics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  starts_on TEXT,
  ends_on TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  -- 'syllabus' rows are replaced when a new syllabus is read; 'manual' rows stay.
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX subject_topics_subject_idx ON subject_topics (subject_id, position);

CREATE TABLE subject_assessments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- exam | assignment | test | prac | other
  kind TEXT NOT NULL DEFAULT 'assignment',
  due_on TEXT,
  -- How the document put it ("Term 3, Week 8"), shown alongside the date.
  due_label TEXT NOT NULL DEFAULT '',
  weight TEXT NOT NULL DEFAULT '',
  -- The deadline made from this assessment, once the student adds it.
  task_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX subject_assessments_subject_idx ON subject_assessments (subject_id);
