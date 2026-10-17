-- Deadlines live in Priorities: a dated line is linked to the task the planner books prep for.
-- Existing tasks are linked the first time the student's Priorities load, in their own timezone.
ALTER TABLE priorities ADD COLUMN task_id TEXT;
