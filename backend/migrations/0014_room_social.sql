ALTER TABLE study_rooms ADD COLUMN description text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE study_rooms ADD COLUMN colour text NOT NULL DEFAULT 'slate';
--> statement-breakpoint
ALTER TABLE study_rooms ADD COLUMN icon text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE study_rooms ADD COLUMN weekly_goal_minutes integer;
--> statement-breakpoint
CREATE TABLE study_room_messages (
  id text PRIMARY KEY NOT NULL,
  room_id text NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  body text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX study_room_messages_room_time_idx ON study_room_messages(room_id, created_at);
