CREATE TABLE course_requirements (
 course_id TEXT PRIMARY KEY REFERENCES course_catalogs(id), prerequisites TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- A review racing a student's correction must never reopen a closed application.
CREATE TRIGGER student_registration_closed BEFORE UPDATE ON student_registrations
WHEN OLD.status IN ('accepted','discarded')
BEGIN
 SELECT RAISE(ABORT,'This registration has already been closed. Refresh the application.');
END;
