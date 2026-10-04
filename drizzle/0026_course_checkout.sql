ALTER TABLE students ADD COLUMN school_type TEXT NOT NULL DEFAULT 'unspecified';
ALTER TABLE pass_products ADD COLUMN unit_price REAL;
DROP INDEX course_month_bill;
CREATE INDEX course_month_bill ON pass_orders(enrollment_id, billing_month);
UPDATE pass_products SET unit_price = ROUND(price / onsite_credits, 2) WHERE onsite_credits > 0 AND online_credits = 0 AND study_credits = 0;
UPDATE pass_products SET unit_price = ROUND(price / online_credits, 2) WHERE online_credits > 0 AND onsite_credits = 0 AND study_credits = 0;
UPDATE pass_products SET unit_price = ROUND(price / study_credits, 2) WHERE study_credits > 0 AND onsite_credits = 0 AND online_credits = 0;
