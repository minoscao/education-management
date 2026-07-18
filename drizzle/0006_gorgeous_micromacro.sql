CREATE TABLE `campuses` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`map_label` text DEFAULT 'Level 1' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campuses_code_unique` ON `campuses` (`code`);--> statement-breakpoint
ALTER TABLE `classrooms` ADD `campus_id` text REFERENCES campuses(id);