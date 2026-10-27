-- Recording-approved operations. Preserve every sold order snapshot and ticket date.
INSERT INTO app_settings(key,value) VALUES ('recording_operations_v1','{"monthlyDueDay":null,"firstMonthManual":true,"bankName":"","bankAccountName":"","bankAccountNumber":"","walletInstructions":"","unitPrices":{"onsite":20,"online":10,"study":10}}');
UPDATE pass_products SET validity_type='calendar_month',validity_days=30 WHERE id='pass-monthly';

CREATE TABLE student_monthly_plans (
 student_id TEXT PRIMARY KEY REFERENCES students(id),service_month TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'approved' CHECK(status='approved'),
 note TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE pass_order_controls (
 order_id TEXT PRIMARY KEY REFERENCES pass_orders(id),original_amount_cents INTEGER NOT NULL CHECK(original_amount_cents>=0),
 manual_review INTEGER NOT NULL DEFAULT 0 CHECK(manual_review IN(0,1)),revision INTEGER NOT NULL DEFAULT 0,
 adjustment_reason TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO pass_order_controls(order_id,original_amount_cents) SELECT id,CAST(ROUND(total_amount*100) AS INTEGER) FROM pass_orders;
CREATE TRIGGER pass_order_control_insert AFTER INSERT ON pass_orders BEGIN
 INSERT INTO pass_order_controls(order_id,original_amount_cents,manual_review)
 VALUES(NEW.id,CAST(ROUND(NEW.total_amount*100) AS INTEGER),CASE WHEN
 COALESCE((SELECT json_extract(value,'$.firstMonthManual') FROM app_settings WHERE key='recording_operations_v1'),1)=1
 AND NOT EXISTS(SELECT 1 FROM student_monthly_plans WHERE student_id=NEW.student_id)
 AND NOT EXISTS(SELECT 1 FROM pass_orders WHERE student_id=NEW.student_id AND status='paid') THEN 1 ELSE 0 END);
END;
CREATE TABLE course_seat_holds (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES pass_orders(id),booking_id TEXT NOT NULL UNIQUE REFERENCES class_student_bookings(id),
 status TEXT NOT NULL CHECK(status IN('held','confirmed','released')),deadline TEXT NOT NULL DEFAULT '',release_reason TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX course_hold_deadline ON course_seat_holds(status,deadline);
CREATE INDEX course_hold_order ON course_seat_holds(order_id,status);
INSERT INTO course_seat_holds(id,order_id,booking_id,status,deadline)
 SELECT 'hold:'||b.id,o.id,b.id,CASE WHEN o.status='paid' THEN 'confirmed' ELSE 'held' END,COALESCE(o.due_at,'')
 FROM class_student_bookings b JOIN class_sessions s ON s.id=b.class_session_id JOIN pass_orders o ON o.id=(SELECT p.id FROM pass_orders p WHERE p.enrollment_id=b.enrollment_id AND p.billing_month=substr(s.starts_at,1,7) ORDER BY p.created_at DESC,p.id LIMIT 1)
 WHERE b.status='booked' AND b.payment_source='pass';
CREATE TRIGGER course_hold_booking_insert AFTER INSERT ON class_student_bookings WHEN NEW.status='booked' AND NEW.payment_source='pass' BEGIN
 INSERT INTO course_seat_holds(id,order_id,booking_id,status,deadline)
 SELECT 'hold:'||NEW.id,o.id,NEW.id,CASE WHEN o.status='paid' THEN 'confirmed' ELSE 'held' END,COALESCE(o.due_at,'') FROM pass_orders o
 WHERE o.enrollment_id=NEW.enrollment_id AND o.billing_month=(SELECT substr(starts_at,1,7) FROM class_sessions WHERE id=NEW.class_session_id)
 ORDER BY o.created_at DESC,o.id DESC LIMIT 1;
END;
CREATE TRIGGER course_hold_paid AFTER UPDATE OF status ON pass_orders WHEN NEW.status='paid' BEGIN
 UPDATE course_seat_holds SET status='confirmed',updated_at=CURRENT_TIMESTAMP WHERE order_id=NEW.id AND status='held';
END;
CREATE TABLE course_payment_receipts (
 id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES pass_orders(id),receipt_no TEXT NOT NULL UNIQUE,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),method TEXT NOT NULL CHECK(method IN('cash','bank_transfer','duitnow_qr','fee_waiver')),
 reference TEXT NOT NULL DEFAULT '',received_at TEXT NOT NULL,received_by TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',request_key TEXT NOT NULL UNIQUE
);
CREATE TABLE operating_events (
 id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,action TEXT NOT NULL,actor_id TEXT NOT NULL,subject_id TEXT NOT NULL,
 payload_json TEXT NOT NULL,before_json TEXT NOT NULL DEFAULT '{}',after_json TEXT NOT NULL DEFAULT '{}',note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE operation_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
CREATE TABLE campus_cancelled_bookings (
 booking_id TEXT PRIMARY KEY REFERENCES class_student_bookings(id),session_id TEXT NOT NULL REFERENCES class_sessions(id),recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO campus_cancelled_bookings(booking_id,session_id)
 SELECT b.id,b.class_session_id FROM class_student_bookings b JOIN class_attendance a ON a.student_booking_id=b.id
 JOIN class_sessions s ON s.id=b.class_session_id WHERE s.status='cancelled' AND a.note='Lesson cancelled by campus';
CREATE TRIGGER campus_cancellation_capture BEFORE UPDATE OF status ON class_sessions
WHEN NEW.status='cancelled' AND OLD.status!='cancelled' BEGIN
 INSERT OR IGNORE INTO campus_cancelled_bookings(booking_id,session_id)
 SELECT id,NEW.id FROM class_student_bookings WHERE class_session_id=NEW.id AND status='booked';
END;
CREATE TABLE campus_makeups (
 id TEXT PRIMARY KEY,original_session_id TEXT NOT NULL REFERENCES class_sessions(id),target_session_id TEXT NOT NULL REFERENCES class_sessions(id),
 student_id TEXT NOT NULL REFERENCES students(id),original_booking_id TEXT NOT NULL REFERENCES class_student_bookings(id),
 new_booking_id TEXT NOT NULL REFERENCES class_student_bookings(id),compensation_pass_id TEXT REFERENCES student_passes(id),reason TEXT NOT NULL,created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(original_booking_id)
);
CREATE TRIGGER campus_makeup_hold_exemption AFTER INSERT ON campus_makeups BEGIN
 DELETE FROM course_seat_holds WHERE booking_id=NEW.new_booking_id;
END;
