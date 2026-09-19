import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('D1 trigger migrations parenthesize CASE expressions for the remote SQL splitter', () => {
  for (const file of ['0015_learning_integrity.sql', '0016_demo_bootstrap_guard.sql', '0017_payment_bootstrap_guard.sql', '0018_booking_lifecycle.sql']) {
    const sql = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8');
    const tokens = sql.replace(/'(?:''|[^'])*'|--[^\n]*/g, '');
    assert.doesNotMatch(tokens, /(?<!\()\bCASE\b/, `${file}: wrap CASE..END to avoid remote D1 splitting a trigger early`);
  }
});
