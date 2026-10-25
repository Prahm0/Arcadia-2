-- A private end-of-session reflection. The score is optional and never
-- changes the minutes a student has genuinely studied.
ALTER TABLE study_sessions ADD COLUMN lock_in_score INTEGER;
ALTER TABLE study_sessions ADD COLUMN lock_in_reflection TEXT;

CREATE INDEX study_sessions_user_lock_in_idx ON study_sessions(user_id, ended_at);
