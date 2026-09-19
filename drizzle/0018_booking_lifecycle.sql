CREATE TABLE learning_credit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  pass_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  credit_type TEXT NOT NULL,
  service_date TEXT NOT NULL,
  status TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO learning_credit_history (event_id, pass_id, student_id, credit_type, service_date, status)
SELECT id, pass_id, student_id, credit_type, service_date, status FROM learning_credit_events;
CREATE TRIGGER credit_history_insert AFTER INSERT ON learning_credit_events
BEGIN
  INSERT INTO learning_credit_history (event_id, pass_id, student_id, credit_type, service_date, status)
  VALUES (NEW.id, NEW.pass_id, NEW.student_id, NEW.credit_type, NEW.service_date, NEW.status);
END;
CREATE TRIGGER credit_history_update AFTER UPDATE ON learning_credit_events
WHEN NEW.status != OLD.status OR NEW.service_date != OLD.service_date
BEGIN
  INSERT INTO learning_credit_history (event_id, pass_id, student_id, credit_type, service_date, status)
  VALUES (NEW.id, NEW.pass_id, NEW.student_id, NEW.credit_type, NEW.service_date, NEW.status);
END;

CREATE TRIGGER booking_restore_capacity BEFORE UPDATE OF status, delivery_mode ON class_student_bookings
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'learning_integrity_v1') AND NEW.status = 'booked' AND (OLD.status != 'booked' OR OLD.delivery_mode != NEW.delivery_mode)
BEGIN
  SELECT CASE WHEN NEW.delivery_mode = 'onsite' AND
    (SELECT COUNT(*) FROM class_student_bookings WHERE id != NEW.id AND class_session_id = NEW.class_session_id AND status = 'booked' AND delivery_mode = 'onsite') >=
    (SELECT r.capacity FROM class_runs r JOIN class_sessions s ON s.class_run_id = r.id WHERE s.id = NEW.class_session_id)
    THEN RAISE(ABORT, 'This lesson is full.') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM class_student_bookings b JOIN class_sessions a ON a.id = b.class_session_id
    JOIN class_sessions s ON s.id = NEW.class_session_id
    WHERE b.id != NEW.id AND b.student_id = NEW.student_id AND b.status = 'booked' AND a.status != 'cancelled'
      AND a.starts_at < s.ends_at AND a.ends_at > s.starts_at
  ) THEN RAISE(ABORT, 'You already have another lesson at this time.') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM study_bookings b JOIN class_sessions s ON s.id = NEW.class_session_id
    WHERE b.student_id = NEW.student_id AND b.status IN ('booked','present')
      AND b.starts_at < s.ends_at AND b.ends_at > s.starts_at
  ) THEN RAISE(ABORT, 'You already have a study visit at this time.') END;
END;
CREATE TRIGGER lesson_study_conflict BEFORE INSERT ON class_student_bookings
WHEN NEW.status = 'booked' AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'portal_runtime_ready_v2')
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM study_bookings b JOIN class_sessions s ON s.id = NEW.class_session_id
    WHERE b.student_id = NEW.student_id AND b.status IN ('booked','present')
      AND b.starts_at < s.ends_at AND b.ends_at > s.starts_at
  ) THEN RAISE(ABORT, 'You already have a study visit at this time.') END;
END;

CREATE TRIGGER lesson_cancel_credit AFTER UPDATE OF status ON class_sessions
WHEN NEW.status = 'cancelled' AND OLD.status != 'cancelled'
BEGIN
  UPDATE learning_credit_events SET status = 'released', updated_at = CURRENT_TIMESTAMP
  WHERE status = 'reserved' AND booking_id IN (SELECT id FROM class_student_bookings WHERE class_session_id = NEW.id);
  UPDATE class_student_bookings SET status = 'cancelled' WHERE class_session_id = NEW.id;
  UPDATE class_attendance SET status = 'leave', note = 'Lesson cancelled by campus'
  WHERE student_booking_id IN (SELECT id FROM class_student_bookings WHERE class_session_id = NEW.id) AND status = 'pending';
END;
CREATE TRIGGER lesson_move_credit BEFORE UPDATE OF starts_at, ends_at ON class_sessions
WHEN NEW.starts_at != OLD.starts_at OR NEW.ends_at != OLD.ends_at
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM learning_credit_events e JOIN student_passes p ON p.id = e.pass_id
    WHERE e.booking_id IN (SELECT id FROM class_student_bookings WHERE class_session_id = NEW.id)
      AND ((e.status = 'consumed') OR (e.status = 'reserved' AND (p.valid_from > substr(NEW.starts_at,1,10) OR p.valid_until < substr(NEW.starts_at,1,10))))
  ) THEN RAISE(ABORT, 'This move is outside a reserved pass period or a lesson has already been used. Review the affected bookings first.') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM study_bookings b WHERE b.status IN ('booked','present')
      AND b.student_id IN (SELECT student_id FROM class_student_bookings WHERE class_session_id = NEW.id AND status = 'booked')
      AND b.starts_at < NEW.ends_at AND b.ends_at > NEW.starts_at
  ) THEN RAISE(ABORT, 'A learner already has a study visit at this time.') END;
END;
CREATE TRIGGER lesson_move_credit_date AFTER UPDATE OF starts_at ON class_sessions
WHEN NEW.starts_at != OLD.starts_at
BEGIN
  UPDATE learning_credit_events SET service_date = substr(NEW.starts_at,1,10), updated_at = CURRENT_TIMESTAMP
  WHERE status = 'reserved' AND booking_id IN (SELECT id FROM class_student_bookings WHERE class_session_id = NEW.id);
END;
CREATE TRIGGER classroom_study_conflict_insert BEFORE INSERT ON class_resource_bookings
WHEN NEW.status != 'cancelled'
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM study_bookings WHERE classroom_id = NEW.classroom_id AND status IN ('booked','present') AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at)
  THEN RAISE(ABORT, 'This classroom has a study visit at this time.') END;
END;
CREATE TRIGGER classroom_study_conflict_update BEFORE UPDATE ON class_resource_bookings
WHEN NEW.status != 'cancelled'
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM study_bookings WHERE classroom_id = NEW.classroom_id AND status IN ('booked','present') AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at)
  THEN RAISE(ABORT, 'This classroom has a study visit at this time.') END;
END;
