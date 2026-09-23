ALTER TABLE study_sessions ADD COLUMN activity_id text;
ALTER TABLE study_sessions ADD COLUMN local_day text;
ALTER TABLE study_sessions ADD COLUMN subject_key text;
CREATE UNIQUE INDEX study_sessions_activity_idx ON study_sessions(user_id, activity_id);

CREATE TABLE constellation_preferences (
  user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed text NOT NULL DEFAULT 'first-light',
  featured text,
  backdrop text,
  showcase text NOT NULL DEFAULT '[]',
  favourites text NOT NULL DEFAULT '[]',
  ambient_motion integer NOT NULL DEFAULT 1,
  legacy_eligible integer NOT NULL DEFAULT 0
);
-- Only students with an existing sky retain the legacy constellation.
INSERT INTO constellation_preferences (user_id, followed, legacy_eligible)
SELECT DISTINCT user_id, 'first-sky', 1 FROM study_sessions WHERE type != 'break' AND seconds > 0;

CREATE TABLE constellation_milestones (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  constellation_id text NOT NULL,
  star_index integer NOT NULL,
  earned_at integer NOT NULL,
  PRIMARY KEY (user_id, constellation_id, star_index)
);
CREATE TABLE constellation_cards (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  constellation_id text NOT NULL,
  definition_version integer NOT NULL DEFAULT 1,
  earned_at integer NOT NULL,
  added_at integer NOT NULL,
  seen_at integer,
  PRIMARY KEY (user_id, constellation_id)
);
