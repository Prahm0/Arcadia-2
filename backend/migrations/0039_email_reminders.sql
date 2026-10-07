-- Daily study-plan reminder email. On for everyone by default; a student turns
-- it off in Settings or with the one-click link in the email itself. The cron
-- dedupes sends through push_deliveries ("email-plan:<local date>"), so no
-- new table is needed.
ALTER TABLE profiles ADD COLUMN email_reminders_enabled INTEGER NOT NULL DEFAULT 1;
