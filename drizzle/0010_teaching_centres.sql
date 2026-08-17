CREATE TABLE IF NOT EXISTS `teaching_centres` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL
);
