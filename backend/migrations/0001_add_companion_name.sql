-- Adds a `name` column to companions so the companion sheet can persist the
-- pet's name across reloads. drizzle-kit's default recreate-and-copy pattern
-- fails here because the source table has no `name` column to select from, so
-- we go direct with ALTER TABLE (SQLite 3.32+ supports this).
ALTER TABLE `companions` ADD COLUMN `name` text NOT NULL DEFAULT 'Star';
