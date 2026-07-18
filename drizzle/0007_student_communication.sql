ALTER TABLE `students` ADD COLUMN `email` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `student_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL,
  `recipient` text NOT NULL,
  `subject` text NOT NULL,
  `body` text NOT NULL,
  `direction` text DEFAULT 'outbound' NOT NULL,
  `status` text DEFAULT 'prepared' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
