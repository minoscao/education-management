CREATE TABLE IF NOT EXISTS `teaching_languages` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `display_color` text DEFAULT '#0F8AA8' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `teacher_languages` (
  `teacher_id` text NOT NULL,
  `language_id` text NOT NULL,
  PRIMARY KEY(`teacher_id`, `language_id`),
  FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`language_id`) REFERENCES `teaching_languages`(`id`) ON UPDATE no action ON DELETE no action
);
