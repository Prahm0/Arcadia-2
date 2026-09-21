CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS `password_reset_tokens_user_idx` ON `password_reset_tokens` (`user_id`);

CREATE TABLE IF NOT EXISTS `auth_identities` (
  `provider` text NOT NULL,
  `subject` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (`provider`, `subject`)
);
CREATE INDEX IF NOT EXISTS `auth_identities_user_idx` ON `auth_identities` (`user_id`);

CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `count` integer NOT NULL,
  `reset_at` integer NOT NULL
);
