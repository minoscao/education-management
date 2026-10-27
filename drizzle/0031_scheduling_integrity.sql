-- These tables used to be created during a portal read. Preserve existing data.
CREATE TABLE IF NOT EXISTS course_lesson_templates (
 id TEXT PRIMARY KEY NOT NULL, course_id TEXT NOT NULL, lesson_no INTEGER NOT NULL,
 title TEXT NOT NULL, default_duration_minutes INTEGER NOT NULL DEFAULT 90,
 default_teacher_id TEXT, default_classroom_id TEXT, default_pay_amount REAL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(course_id,lesson_no)
);
CREATE TABLE IF NOT EXISTS portal_notifications (
 id TEXT PRIMARY KEY NOT NULL, recipient_type TEXT NOT NULL, recipient_id TEXT NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unread',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS class_session_changes (
 id TEXT PRIMARY KEY NOT NULL, class_session_id TEXT NOT NULL, change_type TEXT NOT NULL,
 original_session_no INTEGER, original_topic TEXT, original_starts_at TEXT, original_ends_at TEXT,
 new_session_no INTEGER, new_topic TEXT, new_starts_at TEXT, new_ends_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS scheduling_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
CREATE INDEX IF NOT EXISTS resource_room_time ON class_resource_bookings(classroom_id,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS teaching_teacher_time ON class_teacher_bookings(teacher_id,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS resource_session ON class_resource_bookings(class_session_id);
CREATE INDEX IF NOT EXISTS teaching_session ON class_teacher_bookings(class_session_id);
CREATE INDEX IF NOT EXISTS template_room_week ON classroom_time_slots(classroom_id,weekday,active);
CREATE INDEX IF NOT EXISTS session_change_session ON class_session_changes(class_session_id,created_at);
-- Compatibility columns on older class_runs/template tables are added by the
-- idempotent schema preflight (PRAGMA + ADD COLUMN), not repeated blindly here.
