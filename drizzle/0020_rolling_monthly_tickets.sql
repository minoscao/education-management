ALTER TABLE pass_products ADD COLUMN issuance_mode TEXT NOT NULL DEFAULT 'balance' CHECK (issuance_mode IN ('balance', 'tickets'));

UPDATE pass_products SET name = 'Monthly learning pass',
  description = '4 onsite lessons, 6 online lessons and 2 study visits. Valid for 30 days from your chosen start date.',
  onsite_credits = 4, online_credits = 6, study_credits = 2,
  validity_type = 'rolling_days', validity_days = 30, price = 160, issuance_mode = 'tickets'
WHERE id = 'pass-monthly';
UPDATE pass_products SET price = 100 WHERE id = 'pass-onsite-4';
UPDATE pass_products SET price = 90 WHERE id = 'pass-online-6';
UPDATE pass_products SET name = 'Study access 10-visit pass', description = 'Ten additional supervised study access visits.', study_credits = 10 WHERE id = 'pass-study-5';
