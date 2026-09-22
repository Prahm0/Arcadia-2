-- Session plans: Arcad sets up each study block when the student opens it.
-- plan     JSON {topic, why, steps: [{minutes, text}], by, createdAt}
-- checkout JSON {done: [step index], leftover, feeling, at}, written when the
--          session ends; the next plan for that subject starts from it.
-- started_at  when the student actually started; a started block is pinned
--          and moved to when it really happened.
ALTER TABLE events ADD COLUMN plan TEXT;
ALTER TABLE events ADD COLUMN checkout TEXT;
ALTER TABLE events ADD COLUMN started_at INTEGER;
