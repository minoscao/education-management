CREATE TABLE teacher_profiles (
 teacher_id TEXT PRIMARY KEY REFERENCES teachers(id), review_status TEXT NOT NULL DEFAULT 'candidate' CHECK(review_status IN ('candidate','approved','rejected')),
 nickname TEXT NOT NULL DEFAULT '', gender TEXT NOT NULL DEFAULT '', date_of_birth TEXT NOT NULL DEFAULT '',
 qualifications TEXT NOT NULL DEFAULT '', university TEXT NOT NULL DEFAULT '', experience_years INTEGER NOT NULL DEFAULT 0,
 allowed_courses TEXT NOT NULL DEFAULT '[]', availability TEXT NOT NULL DEFAULT '[]', review_note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE classroom_time_slots (
 id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 starts_time TEXT NOT NULL, ends_time TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('lesson','break','special')),
 course_id TEXT REFERENCES course_catalogs(id), teacher_id TEXT REFERENCES teachers(id), language_id TEXT REFERENCES teaching_languages(id),
 label TEXT NOT NULL DEFAULT '', capacity INTEGER NOT NULL DEFAULT 16 CHECK(capacity>0), delivery_mode TEXT NOT NULL DEFAULT 'onsite',
 active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE timetable_batches (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, classroom_id TEXT NOT NULL REFERENCES classrooms(id), starts_month TEXT NOT NULL, repeats INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE timetable_batch_runs (batch_id TEXT NOT NULL REFERENCES timetable_batches(id), run_id TEXT NOT NULL UNIQUE REFERENCES class_runs(id), PRIMARY KEY(batch_id,run_id));
-- A guard is inserted inside the same atomic D1 batch as resource reservations.
CREATE TABLE timetable_conflict_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1));
