-- New workflows are additive: historical bookings, payments and credits are preserved.
CREATE TABLE portal_accounts (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),
 student_id TEXT UNIQUE REFERENCES students(id), teacher_id TEXT UNIQUE REFERENCES teachers(id),
 disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE portal_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE INDEX portal_sessions_account ON portal_sessions(account_id);
CREATE TABLE portal_login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, blocked_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE student_profiles (
 student_id TEXT PRIMARY KEY REFERENCES students(id), gender TEXT NOT NULL DEFAULT '', date_of_birth TEXT NOT NULL DEFAULT '',
 enrollment_date TEXT NOT NULL DEFAULT '', student_phone TEXT NOT NULL DEFAULT '', preferred_language TEXT NOT NULL DEFAULT '',
 school_name TEXT NOT NULL DEFAULT '', school_system TEXT NOT NULL DEFAULT '', chinese_name TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT ''
);
CREATE TABLE student_guardians (
 student_id TEXT PRIMARY KEY REFERENCES students(id), full_name TEXT NOT NULL DEFAULT '', relationship TEXT NOT NULL DEFAULT '',
 gender TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', date_of_birth TEXT NOT NULL DEFAULT '',
 address1 TEXT NOT NULL DEFAULT '', address2 TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', post_code TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT ''
);
CREATE TABLE student_registrations (
 id TEXT PRIMARY KEY, student_id TEXT NOT NULL UNIQUE REFERENCES students(id),
 status TEXT NOT NULL CHECK(status IN ('submitted','needs_changes','accepted','discarded')), review_note TEXT NOT NULL DEFAULT '',
 reviewed_by TEXT, submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT
);
CREATE TABLE registration_history (id INTEGER PRIMARY KEY AUTOINCREMENT, registration_id TEXT NOT NULL REFERENCES student_registrations(id), status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE student_memberships (
 student_id TEXT PRIMARY KEY REFERENCES students(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','invoiced','active','suspended')),
 valid_until TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE membership_invoices (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, invoice_no TEXT NOT NULL UNIQUE, student_id TEXT NOT NULL REFERENCES students(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0), status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid','cancelled')),
 valid_until TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TEXT
);
CREATE UNIQUE INDEX membership_one_open_invoice ON membership_invoices(student_id) WHERE status = 'unpaid';
CREATE TABLE membership_receipts (
 id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL UNIQUE REFERENCES membership_invoices(id), receipt_no TEXT NOT NULL UNIQUE,
 amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0), method TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
 received_by TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE membership_access_passes (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL UNIQUE REFERENCES membership_invoices(id), student_id TEXT NOT NULL REFERENCES students(id), valid_until TEXT, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE onboarding_tasks (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), title TEXT NOT NULL, scheduled_at TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '');
CREATE TABLE notification_outbox (
 id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')), attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO app_settings(key,value) VALUES ('booking_policy_v1','{"requireMembership":true,"enforceSchoolStage":true,"g6SecondaryCourseIds":[]}');
