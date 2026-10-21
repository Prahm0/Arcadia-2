-- The community leaderboard is opt-in. Public rows use generated nicknames,
-- never the student's profile name, email or school.
ALTER TABLE profiles ADD COLUMN community_leaderboard_opt_in INTEGER NOT NULL DEFAULT 0;

CREATE INDEX study_sessions_focus_ended_idx ON study_sessions(type, ended_at);
