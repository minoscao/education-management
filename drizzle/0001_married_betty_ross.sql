ALTER TABLE `student_bookings` ADD `fee_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `student_bookings` ADD `payment_status` text DEFAULT 'unpaid' NOT NULL;--> statement-breakpoint
ALTER TABLE `teacher_bookings` ADD `compensation_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `teacher_bookings` ADD `compensation_status` text DEFAULT 'unpaid' NOT NULL;