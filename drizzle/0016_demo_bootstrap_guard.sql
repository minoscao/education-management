-- Legacy demo generation contains intentional clashes. Enforce booking rules after bootstrap.
DROP TRIGGER booking_capacity;
CREATE TRIGGER booking_capacity BEFORE INSERT ON class_student_bookings
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'portal_runtime_ready_v2') AND NEW.status = 'booked' AND NOT EXISTS (SELECT 1 FROM class_student_bookings WHERE id = NEW.id)
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM class_student_bookings WHERE student_id = NEW.student_id AND class_session_id = NEW.class_session_id AND status = 'booked')
    THEN RAISE(ABORT, 'You have already booked this lesson.') END;
  SELECT CASE WHEN NEW.delivery_mode = 'onsite' AND
    (SELECT COUNT(*) FROM class_student_bookings WHERE class_session_id = NEW.class_session_id AND status = 'booked' AND delivery_mode = 'onsite') >=
    (SELECT r.capacity FROM class_runs r JOIN class_sessions s ON s.class_run_id = r.id WHERE s.id = NEW.class_session_id)
    THEN RAISE(ABORT, 'This lesson is full.') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM class_student_bookings b JOIN class_sessions a ON a.id = b.class_session_id
    JOIN class_sessions s ON s.id = NEW.class_session_id
    WHERE b.student_id = NEW.student_id AND b.status = 'booked' AND a.status != 'cancelled'
      AND a.starts_at < s.ends_at AND a.ends_at > s.starts_at
  ) THEN RAISE(ABORT, 'You already have another lesson at this time.') END;
END;
