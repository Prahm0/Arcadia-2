-- Study rooms: small groups joined by a 6-character code, plus one presence
-- row per user that every room they belong to reads from. Presence is per
-- user rather than per room so being in five rooms costs the same writes as
-- being in one, and viewing a room never writes.
CREATE TABLE `study_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_rooms_code_idx` ON `study_rooms` (`code`);--> statement-breakpoint
CREATE INDEX `study_rooms_owner_idx` ON `study_rooms` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `study_room_members` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`room_id`, `user_id`),
	FOREIGN KEY (`room_id`) REFERENCES `study_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_room_members_user_idx` ON `study_room_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_presence` (
	`user_id` text PRIMARY KEY NOT NULL,
	`activity` text DEFAULT 'idle' NOT NULL,
	`subject` text,
	`started_at` integer,
	`duration_seconds` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
