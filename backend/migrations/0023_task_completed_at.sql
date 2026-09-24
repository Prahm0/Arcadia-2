-- When a task was completed, so "finished early" can be measured. Tasks
-- completed before this column existed have no timestamp and don't count.
ALTER TABLE tasks ADD COLUMN completed_at INTEGER;
