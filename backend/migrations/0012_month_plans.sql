-- The month plan Arcad writes at the end of onboarding (and whenever the
-- student asks for a fresh one): a line on the month, then per week a focus
-- and how much time each subject gets. The scheduler reads the weekly
-- minutes; only the newest plan per student is kept.
CREATE TABLE month_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE INDEX month_plans_user_idx ON month_plans (user_id, created_at);
