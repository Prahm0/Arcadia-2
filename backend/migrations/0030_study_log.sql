-- The study log: what was studied, on which topic, for how long and how it
-- left the student. One row per topic touched in a session. Written from the
-- session's own data (plan steps, timer, check-out), never by the model.
CREATE TABLE study_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  -- The subject's name at the time, for sessions on an unlisted subject.
  subject TEXT,
  -- Loses its link if the syllabus is re-read; the title is kept so the row
  -- can be matched to the new topic of the same name.
  topic_id TEXT REFERENCES subject_topics(id) ON DELETE SET NULL,
  topic TEXT NOT NULL DEFAULT '',
  -- Where it came from: a study block, or a timer session not tied to one.
  event_id TEXT,
  activity_id TEXT,
  -- learn | practice | review | assignment | study
  kind TEXT NOT NULL DEFAULT 'study',
  minutes INTEGER NOT NULL,
  -- got_it | shaky | lost, or NULL when they didn't say.
  confidence TEXT,
  -- What's left, in the student's words.
  note TEXT NOT NULL DEFAULT '',
  -- checkout | marked (ticked done without a check-out) | timer
  source TEXT NOT NULL DEFAULT 'checkout',
  -- When the session ended, so the newest row holds the latest rating.
  studied_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX study_log_user_subject_idx ON study_log (user_id, subject_id, studied_at);
CREATE INDEX study_log_event_idx ON study_log (event_id);
CREATE INDEX study_log_activity_idx ON study_log (user_id, activity_id);
CREATE INDEX study_log_topic_idx ON study_log (topic_id);
