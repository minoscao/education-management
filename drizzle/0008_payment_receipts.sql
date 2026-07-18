ALTER TABLE `student_payments` ADD COLUMN `proof_reference` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `student_payments` ADD COLUMN `note` text DEFAULT '' NOT NULL;
