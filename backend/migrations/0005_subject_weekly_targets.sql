-- Weekly study target per subject, in minutes. NULL means "use the default
-- for the student's year level" (defaultWeeklyMinutes in src/lib/scheduler.ts),
-- so subjects created before this column start getting study blocks without a
-- backfill. 0 opts a subject out of maintenance blocks entirely.
--
-- Numbered 0005 rather than 0004 because the unmerged accounts branch already
-- ships a 0004_auth_accounts.sql; the two are independent.
ALTER TABLE subjects ADD COLUMN weekly_minutes INTEGER;
