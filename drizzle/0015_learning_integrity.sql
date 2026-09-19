ALTER TABLE pass_orders ADD COLUMN offer_snapshot TEXT;
ALTER TABLE pass_orders ADD COLUMN fulfilled_at TEXT;
ALTER TABLE pass_orders ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX pass_order_request_key ON pass_orders(request_key) WHERE request_key IS NOT NULL;
ALTER TABLE student_passes ADD COLUMN issuance_key TEXT;
CREATE UNIQUE INDEX pass_issuance_key ON student_passes(issuance_key) WHERE issuance_key IS NOT NULL;
ALTER TABLE class_student_bookings ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'onsite';
ALTER TABLE class_student_bookings ADD COLUMN payment_source TEXT NOT NULL DEFAULT 'course';
ALTER TABLE class_sessions ADD COLUMN online_url TEXT NOT NULL DEFAULT '';

CREATE TABLE learning_credit_events (
  id TEXT PRIMARY KEY NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id),
  pass_id TEXT NOT NULL REFERENCES student_passes(id),
  booking_id TEXT,
  credit_type TEXT NOT NULL CHECK(credit_type IN ('onsite','online','study')),
  service_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','consumed','released')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX learning_credit_pass_status ON learning_credit_events(pass_id, status);
CREATE INDEX learning_credit_student ON learning_credit_events(student_id, service_date);

-- Keep reservation checks and debits inside the same database statement.
CREATE TRIGGER learning_credit_reserve BEFORE INSERT ON learning_credit_events
WHEN NEW.status = 'reserved'
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM student_passes p WHERE p.id = NEW.pass_id AND p.student_id = NEW.student_id
      AND p.credit_type = NEW.credit_type AND p.status = 'active'
      AND p.valid_from <= NEW.service_date AND p.valid_until >= NEW.service_date
      AND (CASE NEW.credit_type WHEN 'onsite' THEN p.onsite_remaining WHEN 'online' THEN p.online_remaining ELSE p.study_remaining END)
        > (SELECT COUNT(*) FROM learning_credit_events e WHERE e.pass_id = p.id AND e.status = 'reserved')
  ) THEN RAISE(ABORT, 'No valid credit is available for this date.') END);
END;

CREATE TRIGGER learning_credit_consume BEFORE UPDATE OF status ON learning_credit_events
WHEN NEW.status = 'consumed' AND OLD.status != 'consumed'
BEGIN
  SELECT (CASE WHEN OLD.status != 'reserved' THEN RAISE(ABORT, 'Reserve a credit before using it.') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM student_passes p WHERE p.id = NEW.pass_id AND p.status = 'active'
      AND p.valid_from <= NEW.service_date AND p.valid_until >= NEW.service_date
      AND (CASE NEW.credit_type WHEN 'onsite' THEN p.onsite_remaining WHEN 'online' THEN p.online_remaining ELSE p.study_remaining END) > 0
  ) THEN RAISE(ABORT, 'No valid credit is available for this date.') END);
  UPDATE student_passes SET
    onsite_remaining = onsite_remaining - (CASE WHEN NEW.credit_type = 'onsite' THEN 1 ELSE 0 END),
    online_remaining = online_remaining - (CASE WHEN NEW.credit_type = 'online' THEN 1 ELSE 0 END),
    study_remaining = study_remaining - (CASE WHEN NEW.credit_type = 'study' THEN 1 ELSE 0 END)
    WHERE id = NEW.pass_id;
END;

CREATE TRIGGER learning_credit_restore AFTER UPDATE OF status ON learning_credit_events
WHEN OLD.status = 'consumed' AND NEW.status = 'released'
BEGIN
  UPDATE student_passes SET
    onsite_remaining = onsite_remaining + (CASE WHEN OLD.credit_type = 'onsite' THEN 1 ELSE 0 END),
    online_remaining = online_remaining + (CASE WHEN OLD.credit_type = 'online' THEN 1 ELSE 0 END),
    study_remaining = study_remaining + (CASE WHEN OLD.credit_type = 'study' THEN 1 ELSE 0 END)
    WHERE id = OLD.pass_id;
END;

CREATE INDEX student_booking_lookup ON class_student_bookings(student_id, class_session_id, status);
CREATE INDEX session_run_date ON class_sessions(class_run_id, starts_at);
CREATE INDEX enrollment_student_status ON class_enrollments(student_id, status);

CREATE TABLE study_bookings (
  id TEXT PRIMARY KEY NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id),
  classroom_id TEXT NOT NULL REFERENCES classrooms(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK(status IN ('booked','present','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX study_room_time ON study_bookings(classroom_id, starts_at, ends_at);
CREATE TRIGGER study_capacity BEFORE INSERT ON study_bookings
WHEN NOT EXISTS (SELECT 1 FROM study_bookings WHERE id = NEW.id)
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM study_bookings WHERE student_id = NEW.student_id AND status != 'cancelled' AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at)
    THEN RAISE(ABORT, 'You already have a study booking at this time.') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM study_bookings WHERE classroom_id = NEW.classroom_id AND status != 'cancelled' AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at) >= (SELECT capacity FROM classrooms WHERE id = NEW.classroom_id)
    THEN RAISE(ABORT, 'This study room is full.') END);
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM class_resource_bookings r JOIN class_sessions s ON s.id = r.class_session_id WHERE r.classroom_id = NEW.classroom_id AND s.status != 'cancelled' AND s.starts_at < NEW.ends_at AND s.ends_at > NEW.starts_at)
    THEN RAISE(ABORT, 'This room has a lesson at that time.') END);
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM class_student_bookings b JOIN class_sessions s ON s.id = b.class_session_id WHERE b.student_id = NEW.student_id AND b.status = 'booked' AND s.status != 'cancelled' AND s.starts_at < NEW.ends_at AND s.ends_at > NEW.starts_at)
    THEN RAISE(ABORT, 'You have a lesson at that time.') END);
END;

CREATE TRIGGER invoice_payment_limit BEFORE INSERT ON student_payments
WHEN NOT EXISTS (SELECT 1 FROM student_payments WHERE id = NEW.id)
BEGIN
  SELECT (CASE WHEN NEW.amount <= 0 OR NEW.amount > (SELECT total_amount - paid_amount FROM student_invoices WHERE id = NEW.invoice_id)
    THEN RAISE(ABORT, 'Payment exceeds the remaining balance. Refresh and try again.') END);
END;
CREATE TRIGGER invoice_payment_total AFTER INSERT ON student_payments
BEGIN
  UPDATE student_invoices SET paid_amount = paid_amount + NEW.amount,
    status = (CASE WHEN paid_amount + NEW.amount >= total_amount THEN 'paid' ELSE 'partly_paid' END)
    WHERE id = NEW.invoice_id;
END;

CREATE TRIGGER booking_capacity BEFORE INSERT ON class_student_bookings
WHEN NEW.status = 'booked' AND NOT EXISTS (SELECT 1 FROM class_student_bookings WHERE id = NEW.id)
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM class_student_bookings WHERE student_id = NEW.student_id AND class_session_id = NEW.class_session_id AND status = 'booked')
    THEN RAISE(ABORT, 'You have already booked this lesson.') END);
  SELECT (CASE WHEN NEW.delivery_mode = 'onsite' AND
    (SELECT COUNT(*) FROM class_student_bookings WHERE class_session_id = NEW.class_session_id AND status = 'booked' AND delivery_mode = 'onsite') >=
    (SELECT r.capacity FROM class_runs r JOIN class_sessions s ON s.class_run_id = r.id WHERE s.id = NEW.class_session_id)
    THEN RAISE(ABORT, 'This lesson is full.') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM class_student_bookings b JOIN class_sessions a ON a.id = b.class_session_id
    JOIN class_sessions s ON s.id = NEW.class_session_id
    WHERE b.student_id = NEW.student_id AND b.status = 'booked' AND a.status != 'cancelled'
      AND a.starts_at < s.ends_at AND a.ends_at > s.starts_at
  ) THEN RAISE(ABORT, 'You already have another lesson at this time.') END);
END;

CREATE TRIGGER enrollment_unique BEFORE INSERT ON class_enrollments
WHEN EXISTS (SELECT 1 FROM class_enrollments WHERE class_run_id = NEW.class_run_id AND student_id = NEW.student_id AND id != NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'This learner already has an enrolment for this class.');
END;
