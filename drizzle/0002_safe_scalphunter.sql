CREATE TABLE `attendance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`course_session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`student_booking_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`marked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_session_id`) REFERENCES `course_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_booking_id`) REFERENCES `student_bookings`(`id`) ON UPDATE no action ON DELETE no action
);
