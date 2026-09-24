CREATE TABLE room_reports (
  id text PRIMARY KEY NOT NULL,
  room_id text NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  reporter_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  note text NOT NULL DEFAULT '',
  message_body text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
  status text NOT NULL DEFAULT 'open'
);
--> statement-breakpoint
CREATE UNIQUE INDEX room_reports_reporter_message_idx ON room_reports(reporter_user_id, message_id);
--> statement-breakpoint
CREATE INDEX room_reports_reporter_created_idx ON room_reports(reporter_user_id, created_at);
--> statement-breakpoint
CREATE INDEX room_reports_status_created_idx ON room_reports(status, created_at);
--> statement-breakpoint
CREATE TABLE user_blocks (
  blocker_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (blocker_user_id, blocked_user_id)
);
--> statement-breakpoint
CREATE INDEX user_blocks_blocked_idx ON user_blocks(blocked_user_id);
--> statement-breakpoint
CREATE TABLE study_room_removed_members (
  room_id text NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  removed_at integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (room_id, user_id)
);
--> statement-breakpoint
CREATE INDEX study_room_removed_members_user_idx ON study_room_removed_members(user_id);
