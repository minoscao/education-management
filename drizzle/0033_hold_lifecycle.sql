-- Keep displayed seat holds consistent with actual booking cancellation.
-- A cancelled personal/campus booking must never be restored by bill payment.
UPDATE course_seat_holds SET status='released',release_reason=CASE
 WHEN EXISTS(SELECT 1 FROM campus_cancelled_bookings c WHERE c.booking_id=course_seat_holds.booking_id) THEN 'campus_cancelled'
 ELSE 'student_cancelled' END,updated_at=CURRENT_TIMESTAMP
WHERE status IN('held','confirmed') AND EXISTS(
 SELECT 1 FROM class_student_bookings b WHERE b.id=course_seat_holds.booking_id AND b.status='cancelled'
);

CREATE TRIGGER course_hold_booking_cancelled AFTER UPDATE OF status ON class_student_bookings
WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN
 UPDATE course_seat_holds SET status='released',release_reason=(CASE
 WHEN EXISTS(SELECT 1 FROM campus_cancelled_bookings c WHERE c.booking_id=NEW.id) THEN 'campus_cancelled'
 ELSE 'student_cancelled' END),updated_at=CURRENT_TIMESTAMP
 WHERE booking_id=NEW.id AND status IN('held','confirmed');
END;
