CREATE TABLE `academic_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_terms_code_unique` ON `academic_terms` (`code`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `class_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`student_booking_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`marked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`student_booking_id`) REFERENCES `class_student_bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_run_id` text NOT NULL,
	`student_id` text NOT NULL,
	`contracted_fee` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'enrolled' NOT NULL,
	`enrolled_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_run_id`) REFERENCES `class_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_resource_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`class_session_id` text NOT NULL,
	`classroom_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_session_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`course_id` text NOT NULL,
	`term_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`enrollment_open_at` text DEFAULT '' NOT NULL,
	`enrollment_close_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course_catalogs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`term_id`) REFERENCES `academic_terms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_runs_code_unique` ON `class_runs` (`code`);--> statement-breakpoint
CREATE TABLE `class_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_run_id` text NOT NULL,
	`session_no` integer NOT NULL,
	`topic` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_run_id`) REFERENCES `class_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_student_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`class_session_id` text NOT NULL,
	`enrollment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`allocated_fee` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_session_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrollment_id`) REFERENCES `class_enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `class_teacher_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`class_session_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`pay_amount` real DEFAULT 0 NOT NULL,
	`pay_status` text DEFAULT 'unpaid' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`class_session_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `course_catalogs` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`subject` text NOT NULL,
	`level` text NOT NULL,
	`default_sessions` integer NOT NULL,
	`default_minutes` integer NOT NULL,
	`list_price` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_catalogs_code_unique` ON `course_catalogs` (`code`);--> statement-breakpoint
CREATE TABLE `student_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_no` text NOT NULL,
	`enrollment_id` text NOT NULL,
	`student_id` text NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`paid_amount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`issued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`due_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `class_enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_invoices_invoice_no_unique` ON `student_invoices` (`invoice_no`);--> statement-breakpoint
CREATE TABLE `student_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`student_id` text NOT NULL,
	`amount` real NOT NULL,
	`method` text DEFAULT 'bank_transfer' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `student_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
