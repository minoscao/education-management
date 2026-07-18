ALTER TABLE `classrooms` ADD `room_type` text DEFAULT 'classroom' NOT NULL;--> statement-breakpoint
ALTER TABLE `classrooms` ADD `resources` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `classrooms` ADD `map_x` integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE `classrooms` ADD `map_y` integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE `classrooms` ADD `map_width` integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE `classrooms` ADD `map_height` integer DEFAULT 110 NOT NULL;