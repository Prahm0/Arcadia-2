-- School holidays: keep the usual plan ('normal'), go lighter ('light', half
-- the daily limit for subject study) or take a break ('off', no subject study;
-- deadlines still get their time). Only applies on dates outside the
-- student's state's terms (backend/src/lib/terms.ts), so Australia for now.
-- holiday_asked_for is the first day of the holidays the student last
-- answered the Today card for, so it asks once per break.
ALTER TABLE profiles ADD COLUMN holiday_mode TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE profiles ADD COLUMN holiday_asked_for TEXT;
