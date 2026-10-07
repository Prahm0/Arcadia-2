-- Arcad's plan changes, round two.
--
-- buffer_before / buffer_after: minutes kept free either side of a
-- commitment ("keep a 2 hour gap around training"). The commitment itself
-- keeps its real times; only study placement treats the gap as busy.
--
-- skip_dates: JSON array of local YYYY-MM-DD dates a repeating commitment
-- doesn't happen ("uni is 12 to 5 today instead"), so one day can change
-- without editing the whole series.
ALTER TABLE commitments ADD COLUMN buffer_before INTEGER NOT NULL DEFAULT 0;
ALTER TABLE commitments ADD COLUMN buffer_after INTEGER NOT NULL DEFAULT 0;
ALTER TABLE commitments ADD COLUMN skip_dates TEXT NOT NULL DEFAULT '[]';

-- Early versions of Arcad saved some one-offs without a date. The scheduler
-- never placed them, but Arcad's context listed them, so it told students
-- they had (say) gym at 11 every day. They were meant for the day they were
-- made, which has passed, so date them then.
UPDATE commitments
SET start_date = date(created_at / 1000, 'unixepoch', '+10 hours')
WHERE recurrence = 'none' AND start_date IS NULL;
