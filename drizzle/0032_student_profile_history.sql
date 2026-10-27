CREATE TABLE IF NOT EXISTS student_profile_history (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  actor_id TEXT NOT NULL,
  changed_fields TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS student_profile_history_student ON student_profile_history(student_id, created_at);
