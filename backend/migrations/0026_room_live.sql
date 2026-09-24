-- Rooms as a live study space: cheers between members, a shared daily goal,
-- and joining someone else's focus session.
ALTER TABLE study_rooms ADD COLUMN daily_goal_minutes integer;
--> statement-breakpoint
-- The member whose session this timer joined. Cleared when the timer stops.
ALTER TABLE user_presence ADD COLUMN group_host_id text;
--> statement-breakpoint
CREATE TABLE study_room_cheers (
  id text PRIMARY KEY NOT NULL,
  room_id text NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  from_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX study_room_cheers_room_time_idx ON study_room_cheers(room_id, created_at);
--> statement-breakpoint
CREATE INDEX study_room_cheers_pair_idx ON study_room_cheers(from_user_id, to_user_id, created_at);
