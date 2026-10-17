-- App blocking (iOS): how many times the student tried to open a blocked app
-- during a study block, and how many times they took "5 more minutes". Null
-- until the phone reports, so "never blocked" and "blocked, no attempts" differ.
ALTER TABLE events ADD COLUMN blocked_attempts INTEGER;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN unlock_snoozes INTEGER;
