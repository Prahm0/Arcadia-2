-- Where a study block started before the student (or Arcad, when they
-- applied its change) first moved it. Re-planning reads it so a subject
-- moved off a day isn't put straight back on that day. Null for blocks
-- that were never moved.
ALTER TABLE events ADD COLUMN moved_from integer;
