CREATE TABLE feedback (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('bug', 'idea', 'other')),
  message text NOT NULL,
  email text,
  created_at integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX feedback_user_created_idx ON feedback(user_id, created_at);
--> statement-breakpoint
CREATE INDEX feedback_type_created_idx ON feedback(type, created_at);
--> statement-breakpoint
CREATE INDEX feedback_created_idx ON feedback(created_at);
