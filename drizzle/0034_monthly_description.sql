-- Correct the unsold monthly offer only; historical order snapshots remain intact.
UPDATE pass_products SET description = REPLACE(description,
  'Valid for 30 days from your chosen start date.',
  'Valid for the service calendar month. Unused tickets expire at month end without automatic rollover or refund.')
WHERE id='pass-monthly';
