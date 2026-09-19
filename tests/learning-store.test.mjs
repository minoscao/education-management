import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/lib/learning-store.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText + '\n//# sourceURL=learning-store.ts';
const { LearningStore, passWindows, monthCount, malaysiaDay, creditCoverage, passOfferCards, gradeCode, onlineLessonState, lessonAvailability } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const directory = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(directory).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, directory), 'utf8'));
  function insert(table, values) {
    const fields = db.prepare(`PRAGMA table_info(${table})`).all();
    const record = { ...values };
    for (const f of fields) if (f.notnull && f.dflt_value === null && !(f.name in record)) record[f.name] = /INT|REAL/.test(f.type) ? 0 : `${table}-${f.name}`;
    db.prepare(`INSERT INTO ${table} (${Object.keys(record).join(',')}) VALUES (${Object.keys(record).map(() => '?').join(',')})`).run(...Object.values(record));
  }
  function prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      async run() { return db.prepare(sql).run(...values); },
      execute() { return db.prepare(sql).run(...values); },
    };
  }
  let failAt = null;
  const adapter = {
    prepare,
    async batch(statements) {
      db.exec('BEGIN');
      try {
        for (const [index, statement] of statements.entries()) {
          if (index === failAt) throw new Error('Injected interruption');
          statement.execute();
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  insert('students', { id: 'student', code: 'S1', name: 'Test learner' });
  insert('pass_products', { id: 'monthly', code: 'MONTH', name: 'Monthly', price: 160, onsite_credits: 4, online_credits: 6, study_credits: 2, validity_type: 'calendar_month', validity_days: 31 });
  const store = new LearningStore(adapter, () => new Date('2026-09-19T04:00:00Z'));
  await store.prepareLegacySchema();
  db.exec("INSERT INTO app_settings(key, value) VALUES ('portal_runtime_ready_v2', 'true')");
  return { db, store, insert, interrupt(index) { failAt = index; }, close() { db.close(); } };
}

test('calendar pricing includes empty months and Malaysia midnight', () => {
  assert.equal(monthCount('2026-01-15', '2026-03-15'), 3);
  assert.equal(malaysiaDay(new Date('2026-09-30T17:00:00Z')), '2026-10-01');
  assert.deepEqual(passWindows({ validity_type: 'calendar_month' }, '2028-01-15', 2), [{ from: '2028-01-01', until: '2028-01-31' }, { from: '2028-02-01', until: '2028-02-29' }]);
  assert.throws(() => passWindows({ validity_type: 'calendar_month' }, '2026-02-30', 1));
});

test('delayed payment preserves price, quotas and three independent monthly windows', async () => {
  const f = await fixture();
  try {
    const id = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'test-order-001', months: 3, start: '2026-10-15' });
    f.db.exec("UPDATE pass_products SET price = 999, onsite_credits = 99");
    await f.store.payPass(id);
    await f.store.payPass(id);
    const cards = f.db.prepare("SELECT * FROM student_passes WHERE credit_type != 'package' ORDER BY valid_from").all();
    assert.equal(cards.length, 9);
    assert.equal(cards.filter(p => p.credit_type === 'onsite').reduce((n, p) => n + p.onsite_remaining, 0), 12);
    assert.equal(cards[0].valid_from, '2026-10-01');
    assert.equal(cards.at(-1).valid_until, '2026-12-31');
    assert.equal(f.db.prepare('SELECT SUM(amount) AS n FROM pass_payments').get().n, 480);
    assert.equal(await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'test-order-001', months: 3 }), id);
  } finally { f.close(); }
});

test('interrupted payment rolls everything back and can be retried', async () => {
  const f = await fixture();
  try {
    const id = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'test-order-002', months: 1 });
    f.interrupt(2);
    await assert.rejects(f.store.payPass(id), /Injected/);
    assert.equal(f.db.prepare('SELECT status FROM pass_orders').get().status, 'unpaid');
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM student_passes WHERE credit_type != 'package'").get().n, 0);
    f.interrupt(null);
    await f.store.payPass(id);
    assert.equal(f.db.prepare('SELECT status FROM pass_orders').get().status, 'paid');
  } finally { f.close(); }
});

test('future credits cannot be consumed today', async () => {
  const f = await fixture();
  try {
    const id = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'test-order-003', months: 1, start: '2026-10-01' });
    await f.store.payPass(id);
    await assert.rejects(f.store.consumeCredit('student', 'online', 'lesson:a'), /No online credit/);
  } finally { f.close(); }
});

test('concurrent duplicate entry consumes once; different entries cannot overdraw', async () => {
  const f = await fixture();
  try {
    f.db.exec('UPDATE pass_products SET online_credits = 1');
    const id = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'test-order-004', months: 1 });
    await f.store.payPass(id);
    await Promise.all([f.store.consumeCredit('student', 'online', 'lesson:a'), f.store.consumeCredit('student', 'online', 'lesson:a')]);
    assert.equal(f.db.prepare("SELECT online_remaining AS n FROM student_passes WHERE credit_type = 'online'").get().n, 0);
    await assert.rejects(f.store.consumeCredit('student', 'online', 'lesson:b'));
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM learning_credit_events').get().n, 1);
  } finally { f.close(); }
});

async function teachingFixture() {
  const f = await fixture();
  f.insert('academic_terms', { id: 'term', code: 'T1', name: 'Term' });
  f.insert('course_catalogs', { id: 'course', code: 'F3-MATH', title: 'F3 Maths' });
  f.insert('class_runs', { id: 'run', code: 'RUN1', course_id: 'course', term_id: 'term', name: 'Mandarin / English', capacity: 26, price: 100, status: 'open' });
  f.insert('class_sessions', { id: 'session1', class_run_id: 'run', session_no: 1, starts_at: '2026-09-20 12:00', ends_at: '2026-09-20 13:30' });
  f.insert('class_sessions', { id: 'session2', class_run_id: 'run', session_no: 2, starts_at: '2026-09-27 12:00', ends_at: '2026-09-27 13:30' });
  return f;
}

test('coverage uses each lesson date, expiry and unreserved balance rather than a total', () => {
  const cards = [
    { id: 'sept', credit_type: 'onsite', status: 'active', valid_from: '2026-09-01', valid_until: '2026-09-30', onsite_remaining: 12, onsite_available: 1 },
    { id: 'oct', credit_type: 'onsite', status: 'active', valid_from: '2026-10-01', valid_until: '2026-10-31', onsite_remaining: 12, onsite_available: 12 },
  ];
  assert.deepEqual(creditCoverage(cards, ['2026-09-20', '2026-09-27', '2026-10-04'], 'onsite'), { available: 13, covered: 2, required: 3, missing: 1 });
  assert.equal(creditCoverage(cards, ['2026-09-20'], 'online').available, 0);
  assert.equal(creditCoverage(passOfferCards({ validity_type: 'calendar_month', onsite_credits: 4, online_credits: 6 }, '2026-09-20', 2), ['2026-09-20', '2026-10-04'], 'online').missing, 0);
});

test('buying a pass from an online course preserves the selection and completes it once', async () => {
  const f = await teachingFixture();
  try {
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'course-context-online', months: 1, runId: 'run', mode: 'online' });
    await f.store.payPass(order);
    await f.store.completePassBooking(order);
    await f.store.payPass(order);
    await f.store.completePassBooking(order);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings WHERE delivery_mode = \'online\'').get().n, 2);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pass_payments').get().n, 1);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM learning_credit_events WHERE credit_type = \'online\' AND status = \'reserved\'').get().n, 2);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_enrollments').get().n, 1);
  } finally { f.close(); }
});

test('single-lesson selection survives deferred payment without enrolling the whole course', async () => {
  const f = await teachingFixture();
  try {
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'lesson-context-later', months: 1, runId: 'run', sessionId: 'session2', mode: 'onsite' });
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings').get().n, 0);
    await assert.rejects(f.store.completePassBooking(order), /payment/);
    await f.store.payPass(order);
    await f.store.completePassBooking(order);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings').get().n, 1);
    assert.equal(f.db.prepare('SELECT class_session_id FROM class_student_bookings').get().class_session_id, 'session2');
    assert.equal(f.db.prepare('SELECT status FROM class_enrollments').get().status, 'single_lesson');
  } finally { f.close(); }
});

test('a pass that cannot cover the whole course can be purchased without reserving lessons', async () => {
  const f = await teachingFixture();
  try {
    f.db.exec("UPDATE class_sessions SET starts_at = '2026-10-04 12:00', ends_at = '2026-10-04 13:30' WHERE id = 'session2'");
    const input = { studentId: 'student', productId: 'monthly', requestKey: 'too-short-period', months: 1, runId: 'run', mode: 'online', start: '2026-09-20' };
    const topup = await f.store.createPassOrder(input);
    await f.store.payPass(topup);
    assert.equal(await f.store.completePassBooking(topup), false);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings').get().n, 0);
    assert.equal(f.db.prepare('SELECT status FROM pass_orders').get().status, 'paid');
    const order = await f.store.createPassOrder({ ...input, requestKey: 'longer-period', months: 2 });
    await f.store.payPass(order);
    await f.store.completePassBooking(order);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings').get().n, 2);
  } finally { f.close(); }
});

test('rolling monthly pass issues 12 independent tickets with the chosen 30-day window', async () => {
  const f = await fixture();
  try {
    f.db.exec("UPDATE pass_products SET validity_type = 'rolling_days', validity_days = 30, issuance_mode = 'tickets'");
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'rolling-ticket-order', months: 1, start: '2026-09-21' });
    f.db.exec('UPDATE pass_products SET onsite_credits = 99, price = 999');
    await f.store.payPass(order);
    await f.store.payPass(order);
    const tickets = f.db.prepare("SELECT * FROM student_passes WHERE credit_type != 'package'").all();
    assert.equal(tickets.length, 12);
    for (const [type, count] of [['onsite', 4], ['online', 6], ['study', 2]]) {
      assert.equal(tickets.filter(t => t.credit_type === type).length, count);
    }
    assert.ok(tickets.every(t => t.credits_total === 1 && t.valid_from === '2026-09-21' && t.valid_until === '2026-10-20'));
    assert.equal(f.db.prepare('SELECT SUM(amount) n FROM pass_payments').get().n, 160);
    await assert.rejects(f.store.consumeCredit('student', 'online', 'future-ticket'), /No online credit/);
    await assert.rejects(f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'past-start-date', months: 1, start: '2026-09-18' }), /future start/);
    assert.deepEqual(passWindows({ validity_type: 'rolling_days', validity_days: 30 }, '2028-02-15', 1), [{ from: '2028-02-15', until: '2028-03-15' }]);
  } finally { f.close(); }
});

test('extra online tickets can be bought during onsite selection; ticket use and expiry are enforced', async () => {
  const f = await teachingFixture();
  try {
    f.db.exec("UPDATE pass_products SET validity_type = 'rolling_days', validity_days = 30, issuance_mode = 'tickets', onsite_credits = 0, study_credits = 0, price = 90");
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'extra-online-tickets', months: 1, runId: 'run', mode: 'onsite' });
    await f.store.payPass(order);
    assert.equal(await f.store.completePassBooking(order), false);
    await f.store.consumeCredit('student', 'online', 'online-lesson-1');
    await f.store.consumeCredit('student', 'online', 'online-lesson-1');
    assert.equal(f.db.prepare("SELECT SUM(online_remaining) n FROM student_passes WHERE credit_type = 'online'").get().n, 5);
    f.store.now = () => new Date('2026-10-19T04:00:00Z');
    await assert.rejects(f.store.consumeCredit('student', 'online', 'expired-lesson'), /No online credit/);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings').get().n, 0);
  } finally { f.close(); }
});

test('tickets-only purchase ignores a full class and does not reserve it', async () => {
  const f = await teachingFixture();
  try {
    f.db.exec('UPDATE class_runs SET capacity = 1');
    f.insert('students', { id: 'other', code: 'S2', name: 'Another learner' });
    await f.store.enrollCourse('other', 'run', 'onsite', 'course');
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'topup-full-class', months: 1, runId: 'run', mode: 'onsite', reserveSelection: false });
    await f.store.payPass(order);
    assert.equal(await f.store.completePassBooking(order), false);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM class_student_bookings WHERE student_id = 'student'").get().n, 0);
  } finally { f.close(); }
});

test('a class that fills after ordering cannot charge or issue cards before reservation', async () => {
  const f = await teachingFixture();
  try {
    f.db.exec("UPDATE class_runs SET capacity = 1");
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'seat-lost-after-order', months: 1, runId: 'run', mode: 'onsite' });
    f.insert('students', { id: 'other', code: 'S2', name: 'Another learner' });
    await f.store.enrollCourse('other', 'run', 'onsite', 'course');
    await assert.rejects(f.store.payPass(order), /full or overlaps/);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pass_payments').get().n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM student_passes WHERE credit_type != 'package'").get().n, 0);
    assert.equal(f.db.prepare('SELECT status FROM pass_orders').get().status, 'unpaid');
  } finally { f.close(); }
});

test('room and class edits persist and reject capacity changes that break reservations', async () => {
  const f = await teachingFixture();
  try {
    f.insert('campuses', { id: 'campus', code: 'C1', name: 'Campus' });
    f.insert('classrooms', { id: 'room', code: 'R1', name: 'Room', capacity: 26, campus_id: 'campus' });
    f.insert('class_resource_bookings', { id: 'resource', class_session_id: 'session1', classroom_id: 'room', starts_at: '2026-09-20 12:00', ends_at: '2026-09-20 13:30', status: 'reserved' });
    const edit = { id: 'room', name: 'Maths room', campusId: 'campus', capacity: 26, location: 'Level 1', roomType: 'classroom', resources: 'Screen' };
    await f.store.updateClassroom(edit);
    assert.equal(f.db.prepare('SELECT name FROM classrooms').get().name, 'Maths room');
    await assert.rejects(f.store.updateClassroom({ ...edit, capacity: 25 }), /at least 26/);
    await assert.rejects(f.store.updateClassroom({ ...edit, campusId: 'missing' }), /campus/);
    await assert.rejects(f.store.updateClassroom({ ...edit, capacity: 2.5 }), /whole number/);
    await f.store.enrollCourse('student', 'run', 'onsite', 'course');
    await f.store.updateRun({ id: 'run', name: 'Updated class', capacity: 26, price: 160 });
    assert.equal(f.db.prepare('SELECT name FROM class_runs').get().name, 'Updated class');
    assert.equal(f.db.prepare('SELECT total_amount FROM student_invoices').get().total_amount, 100);
    await assert.rejects(f.store.updateRun({ id: 'run', name: 'Large class', capacity: 27, price: 160 }), /only 26/);
    await assert.rejects(f.store.updateRun({ id: 'run', name: 'Invalid', capacity: 26, price: -1 }), /valid fee/);
  } finally { f.close(); }
});

test('legacy demo repair creates unpaid invoices and pending attendance once without inventing payments', async () => {
  const f = await teachingFixture();
  try {
    f.insert('class_enrollments', { id: 'plan-enrollment-01-01', class_run_id: 'run', student_id: 'student', contracted_fee: 100, status: 'enrolled' });
    await f.store.reconcileDemoEnrollments();
    await f.store.reconcileDemoEnrollments();
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM class_student_bookings').get().n, 2);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM class_attendance WHERE status = \'pending\'').get().n, 2);
    assert.deepEqual({ ...f.db.prepare('SELECT total_amount, paid_amount, status FROM student_invoices').get() }, { total_amount: 100, paid_amount: 0, status: 'unpaid' });
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM student_payments').get().n, 0);
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    const booking = f.db.prepare('SELECT id FROM class_student_bookings WHERE class_session_id = \'session1\'').get().id;
    await assert.rejects(f.store.markAttendance(booking, 'present'), /payment/);
    await f.store.payInvoice({ invoiceId: 'plan-enrollment-01-01:invoice', requestKey: 'legacy-payment' });
    await f.store.markAttendance(booking, 'present');
    assert.equal(f.db.prepare('SELECT status FROM class_attendance WHERE student_booking_id = ?').get(booking).status, 'present');
  } finally { f.close(); }
});

test('one lesson reserves one seat and credit; cancelling releases both without a debit', async () => {
  const f = await teachingFixture();
  try {
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'single-lesson', months: 1 });
    await f.store.payPass(order);
    await f.store.bookLesson('student', 'session1', 'onsite');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM class_student_bookings').get().n, 1);
    assert.equal(f.db.prepare('SELECT status FROM class_enrollments').get().status, 'single_lesson');
    assert.equal(f.db.prepare("SELECT onsite_remaining AS n FROM student_passes WHERE credit_type = 'onsite'").get().n, 4);
    await f.store.cancelLesson('student', 'session1');
    assert.equal(f.db.prepare('SELECT status FROM learning_credit_events').get().status, 'released');
    assert.equal(f.db.prepare('SELECT status FROM class_student_bookings').get().status, 'cancelled');
  } finally { f.close(); }
});

test('attendance consumes exactly once and a staff correction restores the credit', async () => {
  const f = await teachingFixture();
  try {
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'attendance-test', months: 1 });
    await f.store.payPass(order);
    const booking = await f.store.bookLesson('student', 'session1', 'onsite');
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    await f.store.markAttendance(booking, 'present');
    await f.store.markAttendance(booking, 'late');
    assert.equal(f.db.prepare("SELECT onsite_remaining AS n FROM student_passes WHERE credit_type = 'onsite'").get().n, 3);
    await f.store.markAttendance(booking, 'pending', 'Corrected by staff');
    assert.equal(f.db.prepare("SELECT onsite_remaining AS n FROM student_passes WHERE credit_type = 'onsite'").get().n, 4);
  } finally { f.close(); }
});

test('whole-course online enrolment preserves mode and partial payments total correctly', async () => {
  const f = await teachingFixture();
  try {
    const result = await f.store.enrollCourse('student', 'run', 'online', 'course');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM class_student_bookings').get().n, 2);
    assert.equal(f.db.prepare('SELECT delivery_mode FROM class_student_bookings').get().delivery_mode, 'online');
    await f.store.payInvoice({ invoiceId: result.invoiceId, requestKey: 'part-1', amount: 40 });
    await f.store.payInvoice({ invoiceId: result.invoiceId, requestKey: 'part-1', amount: 40 });
    assert.equal(f.db.prepare('SELECT paid_amount FROM student_invoices').get().paid_amount, 40);
    await f.store.payInvoice({ invoiceId: result.invoiceId, requestKey: 'part-2', amount: 60 });
    assert.equal(f.db.prepare('SELECT status FROM student_invoices').get().status, 'paid');
  } finally { f.close(); }
});

test('no classroom link means no online debit; repeated entry uses one credit', async () => {
  const f = await teachingFixture();
  try {
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'online-test', months: 1 });
    await f.store.payPass(order);
    await f.store.bookLesson('student', 'session1', 'online');
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    await assert.rejects(f.store.joinOnline('student', 'session1'), /classroom link/);
    assert.equal(f.db.prepare("SELECT online_remaining AS n FROM student_passes WHERE credit_type = 'online'").get().n, 6);
    f.db.exec("UPDATE class_sessions SET online_url = 'https://example.com/classroom' WHERE id = 'session1'");
    await f.store.joinOnline('student', 'session1');
    await f.store.joinOnline('student', 'session1');
    assert.equal(f.db.prepare("SELECT online_remaining AS n FROM student_passes WHERE credit_type = 'online'").get().n, 5);
  } finally { f.close(); }
});

test('online seats are unlimited while unavailable onsite lessons are disabled', () => {
  const lesson = { id: 's', starts_at: '2026-09-20 12:00', ends_at: '2026-09-20 13:30', status: 'scheduled', online_url: 'https://example.com/class' };
  const bookings = [{ student_id: 'other', class_session_id: 's', delivery_mode: 'onsite', status: 'booked' }];
  const before = new Date('2026-09-20T03:00:00Z').getTime();
  assert.equal(lessonAvailability(lesson, 1, bookings, 'student', 'onsite', before).reason, 'Full');
  assert.equal(lessonAvailability(lesson, 1, bookings, 'student', 'online', before).disabled, false);
  assert.equal(lessonAvailability(lesson, 1, bookings, 'student', 'online', before).seats, null);
  assert.equal(onlineLessonState(lesson, new Date('2026-09-20T03:44:59Z').getTime()), 'upcoming');
  assert.equal(onlineLessonState(lesson, new Date('2026-09-20T03:45:00Z').getTime()), 'opening');
  assert.equal(onlineLessonState(lesson, new Date('2026-09-20T04:00:00Z').getTime()), 'live');
  assert.equal(onlineLessonState(lesson, new Date('2026-09-20T05:30:00Z').getTime()), 'ended');
  assert.equal(gradeCode('G4 English'), 'G4');
  assert.equal(gradeCode('Mathematics Year 7'), 'Y7');
  assert.notEqual(gradeCode('F1 Maths'), gradeCode('L1 Maths'));
});

test('same-grade live drop-in creates attendance and consumes one ticket atomically without pre-booking', async () => {
  const f = await teachingFixture();
  try {
    f.db.exec("UPDATE students SET level = 'F3 English'; UPDATE class_sessions SET online_url = 'https://example.com/live'; UPDATE class_runs SET capacity = 1");
    f.insert('students', { id: 'other', code: 'S2', name: 'Other learner' });
    await f.store.enrollCourse('other', 'run', 'onsite', 'course');
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'live-drop-in-test', months: 1 });
    await f.store.payPass(order);
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    f.interrupt(3);
    await assert.rejects(f.store.joinOnline('student', 'session1'), /Injected/);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM class_student_bookings WHERE student_id = 'student'").get().n, 0);
    f.interrupt(null);
    const urls = await Promise.all([f.store.joinOnline('student', 'session1'), f.store.joinOnline('student', 'session1')]);
    assert.deepEqual(urls, ['https://example.com/live', 'https://example.com/live']);
    assert.equal(f.db.prepare("SELECT online_remaining n FROM student_passes WHERE credit_type = 'online'").get().n, 5);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM class_student_bookings WHERE student_id = 'student'").get().n, 1);
    assert.equal(f.db.prepare("SELECT status FROM class_enrollments WHERE student_id = 'student'").get().status, 'single_lesson');
    assert.equal(f.db.prepare("SELECT a.status FROM class_attendance a JOIN class_student_bookings b ON b.id = a.student_booking_id WHERE b.student_id = 'student'").get().status, 'present');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM learning_credit_events WHERE status = 'consumed'").get().n, 1);
  } finally { f.close(); }
});

test('drop-in reuses cancelled legacy attendance records and debits once', async () => {
  const f = await teachingFixture();
  try {
    f.db.exec("UPDATE students SET level = 'F3'; UPDATE class_sessions SET online_url = 'https://example.com/live'");
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'legacy-dropin', months: 1 });
    await f.store.payPass(order);
    const booking = await f.store.bookLesson('student', 'session1', 'online');
    await f.store.cancelLesson('student', 'session1');
    f.db.prepare("UPDATE class_attendance SET id = 'legacy-attendance' WHERE student_booking_id = ?").run(booking);
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    await f.store.joinOnline('student', 'session1');
    await f.store.joinOnline('student', 'session1');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_attendance').get().n, 1);
    assert.equal(f.db.prepare("SELECT status FROM class_attendance WHERE id = 'legacy-attendance'").get().status, 'present');
    assert.equal(f.db.prepare("SELECT online_remaining n FROM student_passes WHERE credit_type = 'online'").get().n, 5);
  } finally { f.close(); }
});

test('drop-in rejects wrong grade, missing link, early entry, ended sessions and insufficient credits without writes', async () => {
  const f = await teachingFixture();
  try {
    f.db.exec("UPDATE students SET level = 'F2'; UPDATE class_sessions SET online_url = 'https://example.com/live'");
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    await assert.rejects(f.store.joinOnline('student', 'session1'), /your grade/);
    f.db.exec("UPDATE students SET level = 'F3'");
    await assert.rejects(f.store.joinOnline('student', 'session1'), /No online credit/);
    f.store.now = () => new Date('2026-09-20T03:44:00Z');
    await assert.rejects(f.store.joinOnline('student', 'session1'), /15 minutes/);
    f.store.now = () => new Date('2026-09-20T05:30:00Z');
    await assert.rejects(f.store.joinOnline('student', 'session1'), /15 minutes/);
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    f.db.exec("UPDATE class_sessions SET online_url = ''");
    await assert.rejects(f.store.joinOnline('student', 'session1'), /classroom link/);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings').get().n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM learning_credit_events').get().n, 0);
  } finally { f.close(); }
});

test('study reservation, check-in and retry consume one credit', async () => {
  const f = await fixture();
  try {
    f.insert('classrooms', { id: 'room', code: 'R1', name: 'Study room', capacity: 1 });
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'study-test', months: 1 });
    await f.store.payPass(order);
    await f.store.bookStudy('student', 'room', '2026-09-20 12:00', '2026-09-20 13:00', 'visit001');
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    await f.store.updateStudy('student', 'study:student:visit001', false);
    await f.store.updateStudy('student', 'study:student:visit001', false);
    assert.equal(f.db.prepare("SELECT study_remaining AS n FROM student_passes WHERE credit_type = 'study'").get().n, 1);
  } finally { f.close(); }
});

test('concurrent order retries return the same order and issue cards once', async () => {
  const f = await fixture();
  try {
    const input = { studentId: 'student', productId: 'monthly', requestKey: 'concurrent-order', months: 1 };
    const ids = await Promise.all([f.store.createPassOrder(input), f.store.createPassOrder(input)]);
    assert.equal(ids[0], ids[1]);
    await Promise.all(ids.map(id => f.store.payPass(id)));
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pass_orders').get().n, 1);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM pass_payments').get().n, 1);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM student_passes WHERE status = 'active'").get().n, 3);
  } finally { f.close(); }
});

test('cancel and rebook preserves credit history and still enforces capacity', async () => {
  const f = await teachingFixture();
  try {
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'rebook-test', months: 1 });
    await f.store.payPass(order);
    const id = await f.store.bookLesson('student', 'session1', 'onsite');
    await f.store.cancelLesson('student', 'session1');
    f.db.exec('UPDATE class_runs SET capacity = 0');
    await assert.rejects(f.store.bookLesson('student', 'session1', 'onsite'), /full/);
    f.db.exec('UPDATE class_runs SET capacity = 26');
    assert.equal(await f.store.bookLesson('student', 'session1', 'onsite'), id);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings').get().n, 1);
    assert.deepEqual(f.db.prepare('SELECT status FROM learning_credit_history ORDER BY id').all().map(r => r.status), ['reserved', 'released', 'reserved']);
  } finally { f.close(); }
});

test('course purchase replaces individual credit holds without double billing', async () => {
  const f = await teachingFixture();
  try {
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'upgrade-course', months: 1 });
    await f.store.payPass(order);
    await f.store.bookLesson('student', 'session1', 'onsite');
    const result = await f.store.enrollCourse('student', 'run', 'onsite', 'course');
    assert.equal(f.db.prepare('SELECT status FROM learning_credit_events').get().status, 'released');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM class_student_bookings WHERE payment_source = 'course'").get().n, 2);
    await f.store.payInvoice({ invoiceId: result.invoiceId, requestKey: 'paid-upgrade' });
    f.store.now = () => new Date('2026-09-20T04:15:00Z');
    await f.store.markAttendance('student:session1', 'present');
    assert.equal(f.db.prepare("SELECT onsite_remaining n FROM student_passes WHERE credit_type = 'onsite'").get().n, 4);
  } finally { f.close(); }
});

test('insufficient course credits roll back every seat and reservation', async () => {
  const f = await teachingFixture();
  try {
    f.db.exec('UPDATE pass_products SET onsite_credits = 1');
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'insufficient-course', months: 1 });
    await f.store.payPass(order);
    await assert.rejects(f.store.enrollCourse('student', 'run', 'onsite', 'pass'), /No onsite credit/);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM class_student_bookings').get().n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM learning_credit_events').get().n, 0);
  } finally { f.close(); }
});

test('campus cancellation releases holds and moving outside pass validity is blocked', async () => {
  const f = await teachingFixture();
  try {
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'cancel-campus', months: 1 });
    await f.store.payPass(order);
    await f.store.bookLesson('student', 'session1', 'onsite');
    assert.throws(() => f.db.exec("UPDATE class_sessions SET starts_at = '2026-10-20 12:00', ends_at = '2026-10-20 13:30' WHERE id = 'session1'"), /pass period/);
    f.db.exec("UPDATE class_sessions SET status = 'cancelled' WHERE id = 'session1'");
    assert.equal(f.db.prepare('SELECT status FROM learning_credit_events').get().status, 'released');
    assert.equal(f.db.prepare('SELECT status FROM class_student_bookings').get().status, 'cancelled');
  } finally { f.close(); }
});

test('study booking prevents conflicting lesson booking and releases on cancellation', async () => {
  const f = await teachingFixture();
  try {
    f.insert('classrooms', { id: 'room', code: 'R1', name: 'Study', capacity: 1 });
    const order = await f.store.createPassOrder({ studentId: 'student', productId: 'monthly', requestKey: 'study-conflict', months: 1 });
    await f.store.payPass(order);
    await f.store.bookStudy('student', 'room', '2026-09-20 12:00', '2026-09-20 13:00', 'study001');
    await assert.rejects(f.store.bookLesson('student', 'session1', 'onsite'), /study visit/);
    await f.store.updateStudy('student', 'study:student:study001', true);
    await f.store.bookLesson('student', 'session1', 'onsite');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM class_student_bookings WHERE status = 'booked'").get().n, 1);
  } finally { f.close(); }
});

test('legacy combined cards preserve balances and validity without reissuing on retry', async () => {
  const f = await fixture();
  try {
    f.insert('student_passes', { id: 'legacy', student_id: 'student', product_id: 'monthly', name: 'Old pass', credit_type: 'bundle', valid_from: '2026-09-01', valid_until: '2026-09-30', onsite_remaining: 2, online_remaining: 5, study_remaining: 1, status: 'active' });
    await f.store.migrateLegacyCards();
    await f.store.migrateLegacyCards();
    const cards = f.db.prepare("SELECT * FROM student_passes WHERE status = 'active'").all();
    assert.equal(cards.length, 3);
    assert.equal(cards.find(p => p.credit_type === 'onsite').onsite_remaining, 2);
    assert.ok(cards.every(p => p.valid_until === '2026-09-30'));
  } finally { f.close(); }
});
