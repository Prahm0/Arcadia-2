-- Keep a short explanation with missed study blocks so Arcad can spot
-- scheduling patterns. Both fields stay nullable for existing events and
-- automatic misses that have not been explained yet.
ALTER TABLE events ADD COLUMN miss_reason TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN miss_note TEXT;
