-- Read-only calendar subscriptions. A student pastes any .ics URL (Apple
-- Calendar share link, Canvas export, Outlook publish URL, per-calendar
-- Google export, etc.) and we poll it periodically. `etag` and `last_modified`
-- let us do conditional GETs so a heavy Canvas feed doesn't retransmit MBs
-- every sync.
CREATE TABLE `calendar_feeds` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `url` text NOT NULL,
  `name` text NOT NULL DEFAULT 'Calendar',
  `color` text NOT NULL DEFAULT '#7c5cff',
  `etag` text,
  `last_modified` text,
  `last_sync_at` integer,
  `last_sync_error` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX `calendar_feeds_user_idx` ON `calendar_feeds` (`user_id`);

-- Adds a `feed_id` column so imported events can be scoped to their source
-- feed. When a feed is deleted or an event vanishes from its remote source
-- we clean up matching rows. Also adds `external_uid` for stable upsert
-- keys — an .ics VEVENT's UID is the canonical identifier across syncs.
--
-- drizzle-kit's recreate-and-copy pattern chokes here because the old
-- `events` table has no `feed_id`/`external_uid` columns to select from,
-- so we go direct with ALTER TABLE (SQLite 3.32+ supports this).
ALTER TABLE `events` ADD COLUMN `feed_id` text;
ALTER TABLE `events` ADD COLUMN `external_uid` text;

CREATE INDEX `events_feed_idx` ON `events` (`feed_id`);
CREATE INDEX `events_feed_uid_idx` ON `events` (`feed_id`, `external_uid`);
