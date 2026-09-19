DROP TRIGGER invoice_payment_limit;
DROP TRIGGER invoice_payment_total;
CREATE TRIGGER invoice_payment_limit BEFORE INSERT ON student_payments
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'portal_runtime_ready_v2') AND NOT EXISTS (SELECT 1 FROM student_payments WHERE id = NEW.id)
BEGIN
  SELECT CASE WHEN NEW.amount <= 0 OR NEW.amount > (SELECT total_amount - paid_amount FROM student_invoices WHERE id = NEW.invoice_id)
    THEN RAISE(ABORT, 'Payment exceeds the remaining balance. Refresh and try again.') END;
END;
CREATE TRIGGER invoice_payment_total AFTER INSERT ON student_payments
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'portal_runtime_ready_v2')
BEGIN
  UPDATE student_invoices SET paid_amount = paid_amount + NEW.amount,
    status = CASE WHEN paid_amount + NEW.amount >= total_amount THEN 'paid' ELSE 'partly_paid' END
    WHERE id = NEW.invoice_id;
END;
