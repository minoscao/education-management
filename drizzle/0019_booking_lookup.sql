CREATE INDEX IF NOT EXISTS booking_session_capacity ON class_student_bookings(class_session_id, status, delivery_mode);
CREATE INDEX IF NOT EXISTS booking_enrollment ON class_student_bookings(enrollment_id);
CREATE INDEX IF NOT EXISTS invoice_enrollment ON student_invoices(enrollment_id);
CREATE INDEX IF NOT EXISTS attendance_booking ON class_attendance(student_booking_id);
