ALTER TABLE `student_passes` ADD COLUMN `order_id` text;
--> statement-breakpoint
ALTER TABLE `student_passes` ADD COLUMN `credit_type` text DEFAULT 'bundle' NOT NULL;
--> statement-breakpoint
ALTER TABLE `student_passes` ADD COLUMN `credits_total` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_credit_uses` (
  `id` text PRIMARY KEY NOT NULL,
  `pass_id` text NOT NULL,
  `student_id` text NOT NULL,
  `class_run_id` text,
  `class_session_id` text,
  `credit_type` text NOT NULL,
  `amount` integer DEFAULT 1 NOT NULL,
  `used_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
