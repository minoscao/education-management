CREATE TABLE IF NOT EXISTS `pass_products` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `onsite_credits` integer DEFAULT 0 NOT NULL,
  `online_credits` integer DEFAULT 0 NOT NULL,
  `study_credits` integer DEFAULT 0 NOT NULL,
  `validity_type` text DEFAULT 'calendar_month' NOT NULL,
  `validity_days` integer DEFAULT 30 NOT NULL,
  `price` real DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_passes` (
  `id` text PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL,
  `product_id` text NOT NULL,
  `name` text NOT NULL,
  `valid_from` text NOT NULL,
  `valid_until` text NOT NULL,
  `onsite_remaining` integer DEFAULT 0 NOT NULL,
  `online_remaining` integer DEFAULT 0 NOT NULL,
  `study_remaining` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pass_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `pass_id` text NOT NULL,
  `student_id` text NOT NULL,
  `product_id` text NOT NULL,
  `selected_run_id` text,
  `delivery_mode` text,
  `total_amount` real DEFAULT 0 NOT NULL,
  `paid_amount` real DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'unpaid' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pass_payments` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `student_id` text NOT NULL,
  `amount` real NOT NULL,
  `method` text DEFAULT 'duitnow_qr' NOT NULL,
  `proof_reference` text DEFAULT '' NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pass_credit_uses` (
  `id` text PRIMARY KEY NOT NULL,
  `pass_id` text NOT NULL,
  `student_booking_id` text NOT NULL UNIQUE,
  `credit_type` text NOT NULL,
  `amount` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
