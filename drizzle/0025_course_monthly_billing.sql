ALTER TABLE pass_orders ADD COLUMN enrollment_id TEXT REFERENCES class_enrollments(id);
ALTER TABLE pass_orders ADD COLUMN billing_month TEXT;
ALTER TABLE pass_orders ADD COLUMN due_at TEXT;
ALTER TABLE pass_orders ADD COLUMN plan_key TEXT;
CREATE UNIQUE INDEX course_month_bill ON pass_orders(enrollment_id, billing_month) WHERE enrollment_id IS NOT NULL AND billing_month IS NOT NULL;
CREATE INDEX pass_order_plan ON pass_orders(plan_key);
ALTER TABLE class_student_bookings ADD COLUMN point_penalty INTEGER NOT NULL DEFAULT 0;
