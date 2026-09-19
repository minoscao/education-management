export type RecordData = Record<string, unknown>;
export type Statement = {
  bind(...values: unknown[]): Statement;
  first<T = RecordData>(): Promise<T | null>;
  all<T = RecordData>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};
export type Database = { prepare(sql: string): Statement; batch(items: Statement[]): Promise<unknown> };
type Query = { sql: string; values: unknown[] };
export type CreditType = 'onsite' | 'online' | 'study';
type Offer = {
  id: string; name: string; price: number; validity_type: string; validity_days: number;
  onsite_credits: number; online_credits: number; study_credits: number;
};
type Window = { from: string; until: string };
type Snapshot = { product: Offer; windows: Window[]; booking?: { runId: string; sessionId?: string; mode: 'onsite' | 'online' } };

export function malaysiaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function malaysiaTime(now = new Date()) {
  return `${malaysiaDay(now)} ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now)}`;
}

export function monthCount(first: string, last: string) {
  const start = new Date(`${first.slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${last.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return 1;
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
}

export function passWindows(product: Pick<Offer, 'validity_type' | 'validity_days'>, anchor: string, months: number): Window[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || !Number.isInteger(months) || months < 1 || months > 24) throw new Error('Choose a valid date and 1 to 24 months.');
  const date = new Date(`${anchor}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== anchor) throw new Error('Choose a valid date.');
  if (product.validity_type !== 'calendar_month') {
    if (months !== 1) throw new Error('Additional visit cards are purchased one at a time.');
    const end = new Date(date);
    end.setUTCDate(end.getUTCDate() + Math.max(1, product.validity_days) - 1);
    return [{ from: anchor, until: end.toISOString().slice(0, 10) }];
  }
  return Array.from({ length: months }, (_, index) => ({
    from: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index, 1, 12)).toISOString().slice(0, 10),
    until: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index + 1, 0, 12)).toISOString().slice(0, 10),
  }));
}

const creditColumn = (type: CreditType) => `${type}_remaining`;
const uid = (name: string) => `${name}-${crypto.randomUUID()}`;

export function creditCoverage(cards: RecordData[], dates: string[], type: 'onsite' | 'online') {
  const days = dates.map(date => date.slice(0, 10)).sort();
  const eligible = cards.filter(card => card.status === 'active' && card.credit_type === type && days.some(day => String(card.valid_from) <= day && String(card.valid_until) >= day))
    .map(card => ({ id: String(card.id), valid_from: String(card.valid_from), valid_until: String(card.valid_until), available: Math.max(0, Number(card[`${type}_available`] ?? card[`${type}_remaining`] ?? 0)) }))
    .sort((a, b) => String(a.valid_until).localeCompare(String(b.valid_until)) || String(a.id).localeCompare(String(b.id)));
  const available = eligible.reduce((sum, card) => sum + card.available, 0);
  let covered = 0;
  for (const day of days) {
    const card = eligible.find(card => card.available > 0 && String(card.valid_from) <= day && String(card.valid_until) >= day);
    if (card) { card.available--; covered++; }
  }
  return { available, covered, required: days.length, missing: days.length - covered };
}

export function passOfferCards(product: RecordData, anchor: string, months: number): RecordData[] {
  return passWindows({ validity_type: String(product.validity_type), validity_days: Number(product.validity_days) }, anchor, months)
    .flatMap((window, index) => (['onsite', 'online'] as const).map(type => ({ id: `offer:${index}:${type}`, credit_type: type, status: 'active', valid_from: window.from, valid_until: window.until, [`${type}_available`]: Number(product[`${type}_credits`] || 0) })));
}

export class LearningStore {
  constructor(readonly db: Database, readonly now: () => Date = () => new Date()) {}
  async one<T = RecordData>(sql: string, values: unknown[] = []) { return this.db.prepare(sql).bind(...values).first<T>(); }
  async all<T = RecordData>(sql: string, values: unknown[] = []) { return (await this.db.prepare(sql).bind(...values).all<T>()).results ?? []; }
  async batch(queries: Query[]) { if (queries.length) await this.db.batch(queries.map(q => this.db.prepare(q.sql).bind(...q.values))); }

  async updateClassroom(input: { id: string; name: string; campusId: string; capacity: number; location: string; roomType: string; resources: string }) {
    if (!input.name.trim() || !Number.isInteger(input.capacity) || input.capacity < 1) throw new Error('Enter a classroom name and a whole number of seats.');
    if (!await this.one('SELECT id FROM classrooms WHERE id = ?', [input.id])) throw new Error('Classroom not found.');
    if (!await this.one('SELECT id FROM campuses WHERE id = ?', [input.campusId])) throw new Error('Choose an existing campus.');
    const scheduled = await this.one<{ seats: number }>(`SELECT MAX(r.capacity) AS seats FROM class_resource_bookings b JOIN class_sessions s ON s.id = b.class_session_id JOIN class_runs r ON r.id = s.class_run_id WHERE b.classroom_id = ? AND b.status = 'reserved' AND s.status != 'cancelled' AND s.ends_at > ?`, [input.id, malaysiaTime(this.now())]);
    if (input.capacity < Number(scheduled?.seats || 0)) throw new Error(`This room needs at least ${scheduled!.seats} seats for its scheduled classes.`);
    const study = await this.one<{ seats: number }>(`SELECT MAX((SELECT COUNT(*) FROM study_bookings other WHERE other.classroom_id = b.classroom_id AND other.status IN ('booked', 'present') AND other.starts_at <= b.starts_at AND other.ends_at > b.starts_at)) AS seats FROM study_bookings b WHERE b.classroom_id = ? AND b.status IN ('booked', 'present') AND b.ends_at > ?`, [input.id, malaysiaTime(this.now())]);
    if (input.capacity < Number(study?.seats || 0)) throw new Error('The new capacity cannot accommodate existing study bookings.');
    await this.db.prepare('UPDATE classrooms SET name = ?, campus_id = ?, capacity = ?, location = ?, room_type = ?, resources = ? WHERE id = ?').bind(input.name.trim(), input.campusId, input.capacity, input.location.trim(), input.roomType.trim() || 'classroom', input.resources.trim(), input.id).run();
  }

  async updateRun(input: { id: string; name: string; capacity: number; price: number; mode?: string }) {
    if (!input.name.trim() || !Number.isInteger(input.capacity) || input.capacity < 1 || !Number.isFinite(input.price) || input.price < 0) throw new Error('Enter a class name, a whole number of places and a valid fee.');
    if (!await this.one('SELECT id FROM class_runs WHERE id = ?', [input.id])) throw new Error('Class not found.');
    const occupied = await this.one<{ seats: number }>(`SELECT MAX(seats) AS seats FROM (SELECT COUNT(*) AS seats FROM class_enrollments WHERE class_run_id = ? AND status = 'enrolled' AND delivery_mode = 'onsite' UNION ALL SELECT COUNT(*) AS seats FROM class_student_bookings b JOIN class_sessions s ON s.id = b.class_session_id WHERE s.class_run_id = ? AND b.status = 'booked' AND b.delivery_mode = 'onsite' AND s.status != 'cancelled' GROUP BY s.id)`, [input.id, input.id]);
    if (input.capacity < Number(occupied?.seats || 0)) throw new Error(`This class already has ${occupied!.seats} onsite places reserved.`);
    const room = await this.one<{ seats: number }>(`SELECT MIN(c.capacity) AS seats FROM class_resource_bookings b JOIN classrooms c ON c.id = b.classroom_id JOIN class_sessions s ON s.id = b.class_session_id WHERE s.class_run_id = ? AND b.status = 'reserved' AND s.status != 'cancelled' AND s.ends_at > ?`, [input.id, malaysiaTime(this.now())]);
    if (room?.seats != null && input.capacity > room.seats) throw new Error(`The assigned classroom has only ${room.seats} seats.`);
    await this.db.prepare(`UPDATE class_runs SET name = ?, capacity = ?, price = ?${input.mode ? ', delivery_mode = ?' : ''} WHERE id = ?`).bind(input.name.trim(), input.capacity, input.price, ...(input.mode ? [input.mode === 'online' ? 'online' : 'onsite'] : []), input.id).run();
  }

  async prepareLegacySchema() {
    if (await this.one("SELECT key FROM app_settings WHERE key = 'learning_integrity_v1'")) return;
    const columns = await this.all<{ name: string }>("PRAGMA table_info('class_enrollments')");
    for (const [name, definition] of [['pass_id', 'TEXT'], ['delivery_mode', "TEXT NOT NULL DEFAULT 'onsite'"]]) {
      if (!columns.some(column => column.name === name)) {
        try { await this.db.prepare(`ALTER TABLE class_enrollments ADD COLUMN ${name} ${definition}`).run(); }
        catch (error) {
          const current = await this.all<{ name: string }>("PRAGMA table_info('class_enrollments')");
          if (!current.some(column => column.name === name)) throw error;
        }
      }
    }
    await this.batch([
      { sql: "UPDATE class_student_bookings SET delivery_mode = COALESCE((SELECT delivery_mode FROM class_enrollments WHERE id = enrollment_id), 'onsite'), payment_source = CASE WHEN (SELECT pass_id FROM class_enrollments WHERE id = enrollment_id) IS NOT NULL THEN 'pass' ELSE 'course' END WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'learning_integrity_v1')", values: [] },
      { sql: "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('learning_integrity_v1', 'true')", values: [] },
    ]);
  }

  async migrateLegacyCards() {
    const legacy = await this.one("SELECT id FROM student_passes WHERE status = 'active' AND credit_type IN ('bundle','package') LIMIT 1");
    if (!legacy) return;
    const queries: Query[] = (['onsite', 'online', 'study'] as const).map(type => ({
      sql: `INSERT OR IGNORE INTO student_passes (id, order_id, student_id, product_id, name, credit_type, credits_total, valid_from, valid_until, ${type}_remaining, status, issuance_key)
        SELECT id || ':legacy:${type}', order_id, student_id, product_id, name || ' - ${type}', '${type}', ${type}_remaining, valid_from, valid_until, ${type}_remaining, 'active', id || ':legacy:${type}'
        FROM student_passes WHERE status = 'active' AND credit_type IN ('bundle','package') AND ${type}_remaining > 0`, values: [],
    }));
    queries.push({ sql: "UPDATE student_passes SET status = 'fulfilled' WHERE status = 'active' AND credit_type IN ('bundle','package')", values: [] });
    await this.batch(queries);
  }

  async reconcileDemoEnrollments() {
    if (await this.one("SELECT key FROM app_settings WHERE key = 'demo_enrollment_links_v1'")) return;
    // Only the known historical plan seed is repaired; partial real purchases stay untouched.
    await this.batch([
      { sql: `WITH missing AS MATERIALIZED (
          SELECT e.* FROM class_enrollments e WHERE e.id LIKE 'plan-enrollment-%' AND e.status = 'enrolled' AND e.pass_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM class_student_bookings b WHERE b.enrollment_id = e.id)
        ) INSERT INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status, delivery_mode, payment_source)
        SELECT 'repair:' || e.id || ':' || s.id, s.id, e.id, e.student_id,
          e.contracted_fee / (SELECT COUNT(*) FROM class_sessions x WHERE x.class_run_id = e.class_run_id AND x.status != 'cancelled'),
          'booked', e.delivery_mode, 'course'
        FROM missing e JOIN class_sessions s ON s.class_run_id = e.class_run_id WHERE s.status != 'cancelled'`, values: [] },
      { sql: `INSERT INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at)
        SELECT e.id || ':invoice', 'INV-' || e.id, e.id, e.student_id, e.contracted_fee, 0, 'unpaid', e.enrolled_at, substr(e.enrolled_at, 1, 10)
        FROM class_enrollments e WHERE e.id LIKE 'plan-enrollment-%' AND e.status = 'enrolled' AND e.pass_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM student_invoices i WHERE i.enrollment_id = e.id)`, values: [] },
      { sql: `INSERT INTO class_attendance (id, student_booking_id, status, note)
        SELECT 'attendance:' || b.id, b.id, 'pending', '' FROM class_student_bookings b
        WHERE b.enrollment_id LIKE 'plan-enrollment-%' AND b.status = 'booked'
        AND NOT EXISTS (SELECT 1 FROM class_attendance a WHERE a.student_booking_id = b.id)`, values: [] },
      { sql: "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('demo_enrollment_links_v1', 'true')", values: [] },
    ]);
  }

  async createPassOrder(input: { studentId: string; productId: string; requestKey: string; months: number; start?: string; runId?: string; sessionId?: string; mode?: string }) {
    if (!input.studentId || !/^[\w-]{8,100}$/.test(input.requestKey)) throw new Error('Refresh this purchase and try again.');
    const requestKey = `${input.studentId}:${input.requestKey}`;
    const old = await this.one<{ id: string }>('SELECT id FROM pass_orders WHERE request_key = ?', [requestKey]);
    if (old) return old.id;
    const product = await this.one<Offer>("SELECT * FROM pass_products WHERE id = ? AND status = 'active'", [input.productId]);
    if (!product || !await this.one('SELECT id FROM students WHERE id = ?', [input.studentId])) throw new Error('Choose an available pass and learner.');
    const today = malaysiaDay(this.now());
    const anchor = input.start?.slice(0, 10) || today;
    const windows = passWindows(product, anchor, input.months);
    if (windows[0].until < today) throw new Error('Choose the current month or a future month.');
    if (input.runId && !await this.one("SELECT id FROM class_runs WHERE id = ? AND status NOT IN ('cancelled','finished')", [input.runId])) throw new Error('This class is no longer open.');
    const orderId = uid('pass-order');
    const packageId = `${orderId}:package`;
    const snapshot: Snapshot = { product, windows };
    if (input.runId) {
      const mode = input.mode === 'online' ? 'online' : 'onsite';
      const sessions = await this.all<{ id: string; starts_at: string }>("SELECT id, starts_at FROM class_sessions WHERE class_run_id = ? AND status NOT IN ('cancelled','completed') AND starts_at > ? ORDER BY starts_at", [input.runId, malaysiaTime(this.now())]);
      const selected = input.sessionId ? sessions.filter(session => session.id === input.sessionId) : sessions;
      if (!selected.length) throw new Error('This selection has no upcoming lessons.');
      const booked = await this.all<{ class_session_id: string; delivery_mode: string }>("SELECT class_session_id, delivery_mode FROM class_student_bookings WHERE student_id = ? AND status = 'booked'", [input.studentId]);
      if (selected.some(session => booked.some(booking => booking.class_session_id === session.id && booking.delivery_mode !== mode))) throw new Error('Cancel the existing lesson before changing its attendance mode.');
      const dates = selected.filter(session => !booked.some(booking => booking.class_session_id === session.id)).map(session => session.starts_at);
      if (!dates.length) throw new Error('These lessons are already booked. No additional pass is needed.');
      const cards = await this.all(`SELECT p.*, p.${mode}_remaining - (SELECT COUNT(*) FROM learning_credit_events e WHERE e.pass_id = p.id AND e.status = 'reserved') AS ${mode}_available FROM student_passes p WHERE student_id = ? AND credit_type = ? AND status = 'active'`, [input.studentId, mode]);
      if (creditCoverage([...cards, ...passOfferCards(product, anchor, input.months)], dates, mode).missing) throw new Error('This pass does not cover every selected lesson. Choose a pass with enough credits and matching dates.');
      snapshot.booking = { runId: input.runId, sessionId: input.sessionId || undefined, mode };
    }
    try { await this.batch([
      { sql: "INSERT INTO student_passes (id, order_id, student_id, product_id, name, credit_type, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, 'package', ?, ?, 'pending_payment')", values: [packageId, orderId, input.studentId, product.id, product.name, windows[0].from, windows.at(-1)!.until] },
      { sql: "INSERT INTO pass_orders (id, pass_id, student_id, product_id, selected_run_id, delivery_mode, reservation_months, total_amount, paid_amount, status, offer_snapshot, request_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'unpaid', ?, ?)", values: [orderId, packageId, input.studentId, product.id, input.runId || null, input.mode === 'online' ? 'online' : 'onsite', windows.length, Math.round(product.price * windows.length * 100) / 100, JSON.stringify(snapshot), requestKey] },
    ]); } catch (error) {
      const saved = await this.one<{ id: string }>('SELECT id FROM pass_orders WHERE request_key = ?', [requestKey]);
      if (saved) return saved.id;
      throw error;
    }
    return orderId;
  }

  async completePassBooking(orderId: string) {
    const order = await this.one<{ student_id: string; selected_run_id: string; delivery_mode: string; offer_snapshot: string; status: string }>('SELECT * FROM pass_orders WHERE id = ?', [orderId]);
    if (!order || order.status !== 'paid') throw new Error('Complete pass payment before booking.');
    const snapshot: Snapshot | null = order.offer_snapshot ? JSON.parse(order.offer_snapshot) : null;
    const booking = snapshot?.booking || (order.selected_run_id ? { runId: order.selected_run_id, mode: order.delivery_mode === 'online' ? 'online' as const : 'onsite' as const } : null);
    if (!booking) return false;
    if ('sessionId' in booking && booking.sessionId) await this.bookLesson(order.student_id, booking.sessionId, booking.mode);
    else await this.enrollCourse(order.student_id, booking.runId, booking.mode, 'pass');
    return true;
  }

  async payPass(orderId: string, method = 'cash', reference = '', note = '') {
    const order = await this.one<RecordData & { id: string; student_id: string; product_id: string; pass_id: string; offer_snapshot: string; reservation_months: number; total_amount: number; status: string; fulfilled_at: string | null }>("SELECT * FROM pass_orders WHERE id = ?", [orderId]);
    if (!order) throw new Error('Pass order not found.');
    if (order.fulfilled_at) return;
    let snapshot: Snapshot;
    if (order.offer_snapshot) snapshot = JSON.parse(order.offer_snapshot);
    else {
      // Preserve the original package dates when fulfilling a pre-migration order.
      const product = await this.one<Offer>('SELECT * FROM pass_products WHERE id = ?', [order.product_id]);
      const pack = await this.one<{ valid_from: string }>('SELECT valid_from FROM student_passes WHERE id = ?', [order.pass_id]);
      if (!product || !pack) throw new Error('This older order needs a staff review before payment.');
      const existing = await this.one("SELECT id FROM student_passes WHERE order_id = ? AND credit_type IN ('onsite','online','study') LIMIT 1", [orderId]);
      if (existing) throw new Error('This older order already has cards. Please reconcile it before issuing more.');
      snapshot = { product, windows: passWindows(product, pack.valid_from, Number(order.reservation_months || 1)) };
    }
    const queries: Query[] = [];
    for (const window of snapshot.windows) {
      for (const type of ['onsite', 'online', 'study'] as const) {
        const credits = snapshot.product[`${type}_credits`];
        if (!Number.isInteger(credits) || credits < 0) throw new Error('The pass quantities need a staff review.');
        if (!credits) continue;
        const key = `${orderId}:${window.from}:${type}`;
        queries.push({ sql: "INSERT INTO student_passes (id, order_id, student_id, product_id, name, credit_type, credits_total, valid_from, valid_until, onsite_remaining, online_remaining, study_remaining, status, issuance_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?) ON CONFLICT(issuance_key) WHERE issuance_key IS NOT NULL DO NOTHING", values: [key, orderId, order.student_id, order.product_id, `${snapshot.product.name} - ${type}`, type, credits, window.from, window.until, type === 'onsite' ? credits : 0, type === 'online' ? credits : 0, type === 'study' ? credits : 0, key] });
      }
    }
    queries.push(
      { sql: "INSERT INTO pass_payments (id, order_id, student_id, amount, method, proof_reference, note, received_at) SELECT ?, id, student_id, total_amount, ?, ?, ?, CURRENT_TIMESTAMP FROM pass_orders WHERE id = ? AND status != 'paid' ON CONFLICT(id) DO NOTHING", values: [`${orderId}:payment`, method, reference.trim(), note.trim(), orderId] },
      { sql: "UPDATE student_passes SET status = 'fulfilled' WHERE id = ?", values: [order.pass_id] },
      { sql: "UPDATE pass_orders SET status = 'paid', paid_amount = total_amount, offer_snapshot = ?, fulfilled_at = CURRENT_TIMESTAMP WHERE id = ?", values: [JSON.stringify(snapshot), orderId] },
    );
    await this.batch(queries);
  }

  async reserveCredit(studentId: string, type: CreditType, day: string, eventId: string, bookingId: string | null = null, planned = new Map<string, number>()): Promise<Query[]> {
    const existing = await this.one<{ status: string }>('SELECT status FROM learning_credit_events WHERE id = ? AND student_id = ?', [eventId, studentId]);
    if (existing && existing.status !== 'released') return [];
    const candidates = await this.all<{ id: string; available: number }>(`SELECT p.id, p.${creditColumn(type)} - (SELECT COUNT(*) FROM learning_credit_events e WHERE e.pass_id = p.id AND e.status = 'reserved') AS available FROM student_passes p WHERE p.student_id = ? AND p.credit_type = ? AND p.status = 'active' AND p.valid_from <= ? AND p.valid_until >= ? ORDER BY p.valid_until, p.created_at, p.id`, [studentId, type, day, day]);
    const pass = candidates.find(p => p.available > (planned.get(p.id) || 0));
    if (!pass) throw new Error(`No ${type} credit is available for this date. Buy a pass to continue.`);
    planned.set(pass.id, (planned.get(pass.id) || 0) + 1);
    return [
      ...(existing ? [{ sql: "DELETE FROM learning_credit_events WHERE id = ? AND status = 'released'", values: [eventId] }] : []),
      { sql: "INSERT INTO learning_credit_events (id, student_id, pass_id, booking_id, credit_type, service_date, status) SELECT ?, ?, ?, ?, ?, ?, 'reserved' WHERE NOT EXISTS (SELECT 1 FROM learning_credit_events WHERE id = ?)", values: [eventId, studentId, pass.id, bookingId, type, day, eventId] },
    ];
  }

  async consumeCredit(studentId: string, type: CreditType, eventId: string, bookingId: string | null = null) {
    const queries = await this.reserveCredit(studentId, type, malaysiaDay(this.now()), eventId, bookingId);
    queries.push({ sql: "UPDATE learning_credit_events SET status = 'consumed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND student_id = ? AND status = 'reserved'", values: [eventId, studentId] });
    await this.batch(queries);
  }

  async bookLesson(studentId: string, sessionId: string, mode: 'onsite' | 'online') {
    const session = await this.one<{ class_run_id: string; starts_at: string; ends_at: string }>("SELECT s.* FROM class_sessions s JOIN class_runs r ON r.id = s.class_run_id WHERE s.id = ? AND s.status NOT IN ('cancelled','completed') AND r.status NOT IN ('cancelled','finished')", [sessionId]);
    if (!session || session.starts_at.replace('T', ' ') <= malaysiaTime(this.now())) throw new Error('Choose an upcoming lesson.');
    const existing = await this.one<{ id: string; status: string; payment_source: string }>('SELECT id, status, payment_source FROM class_student_bookings WHERE student_id = ? AND class_session_id = ?', [studentId, sessionId]);
    if (existing?.status === 'booked') return existing.id;
    const enrollment = await this.one<{ id: string; pass_id: string | null; status: string }>('SELECT id, pass_id, status FROM class_enrollments WHERE student_id = ? AND class_run_id = ?', [studentId, session.class_run_id]);
    const enrollmentId = enrollment?.id || uid('enrollment');
    const bookingId = existing?.id || `${studentId}:${sessionId}`;
    const source = existing?.payment_source === 'course' && enrollment?.status === 'enrolled' ? 'course' : 'pass';
    const queries: Query[] = [];
    if (!enrollment) queries.push({ sql: "INSERT INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, delivery_mode) VALUES (?, ?, ?, 0, 'single_lesson', ?)", values: [enrollmentId, session.class_run_id, studentId, mode] });
    queries.push(existing
      ? { sql: "UPDATE class_student_bookings SET status = 'booked', delivery_mode = ?, payment_source = ? WHERE id = ?", values: [mode, source, bookingId] }
      : { sql: "INSERT INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status, delivery_mode, payment_source) VALUES (?, ?, ?, ?, 0, 'booked', ?, ?)", values: [bookingId, sessionId, enrollmentId, studentId, mode, source] });
    if (source === 'pass') queries.push(...await this.reserveCredit(studentId, mode, session.starts_at.slice(0, 10), `lesson:${bookingId}`, bookingId));
    queries.push(existing
      ? { sql: "UPDATE class_attendance SET status = 'pending', note = '', marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?", values: [bookingId] }
      : { sql: "INSERT INTO class_attendance (id, student_booking_id, status, note) VALUES (?, ?, 'pending', '')", values: [`attendance:${bookingId}`, bookingId] });
    await this.batch(queries);
    return bookingId;
  }

  async enrollCourse(studentId: string, runId: string, mode: 'onsite' | 'online', source: 'pass' | 'course', agreedFee?: number) {
    const course = await this.one<{ price: number; status: string }>("SELECT price, status FROM class_runs WHERE id = ? AND status NOT IN ('finished','cancelled')", [runId]);
    if (!course) throw new Error('This class is no longer available.');
    const existing = await this.one<{ id: string; status: string }>('SELECT id, status FROM class_enrollments WHERE class_run_id = ? AND student_id = ?', [runId, studentId]);
    if (existing?.status === 'enrolled') {
      const invoice = await this.one<{ id: string }>('SELECT id FROM student_invoices WHERE enrollment_id = ?', [existing.id]);
      return { enrollmentId: existing.id, invoiceId: invoice?.id || '' };
    }
    const sessions = await this.all<{ id: string; starts_at: string }>("SELECT id, starts_at FROM class_sessions WHERE class_run_id = ? AND status NOT IN ('cancelled','completed') ORDER BY starts_at", [runId]);
    const upcoming = sessions.filter(s => s.starts_at.replace('T', ' ') > malaysiaTime(this.now()));
    if (!upcoming.length) throw new Error('There are no upcoming lessons to enrol in.');
    const enrollmentId = existing?.id || uid('enrollment');
    const fee = source === 'pass' ? 0 : Math.round((agreedFee ?? course.price * upcoming.length / sessions.length) * 100) / 100;
    if (!Number.isFinite(fee) || fee < 0) throw new Error('Enter a valid course fee.');
    const queries: Query[] = [{
      sql: existing ? "UPDATE class_enrollments SET status = 'enrolled', contracted_fee = ?, delivery_mode = ? WHERE id = ?" : "INSERT INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, delivery_mode) VALUES (?, ?, ?, ?, 'enrolled', ?)",
      values: existing ? [fee, mode, enrollmentId] : [enrollmentId, runId, studentId, fee, mode],
    }];
    const planned = new Map<string, number>();
    for (const session of upcoming) {
      const old = await this.one<{ id: string; status: string; delivery_mode: string }>('SELECT id, status, delivery_mode FROM class_student_bookings WHERE student_id = ? AND class_session_id = ?', [studentId, session.id]);
      if (old?.status === 'booked' && old.delivery_mode !== mode) throw new Error('Cancel your individual lesson first before changing its attendance mode.');
      const bookingId = old?.id || `${studentId}:${session.id}`;
      if (old && await this.one("SELECT id FROM learning_credit_events WHERE id = ? AND status = 'consumed'", [`lesson:${bookingId}`])) throw new Error('A lesson is already in progress. Finish it before changing this course.');
      queries.push(old
        ? { sql: "UPDATE class_student_bookings SET status = 'booked', delivery_mode = ?, payment_source = ?, allocated_fee = ? WHERE id = ?", values: [mode, source, fee / upcoming.length, bookingId] }
        : { sql: "INSERT INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status, delivery_mode, payment_source) VALUES (?, ?, ?, ?, ?, 'booked', ?, ?)", values: [bookingId, session.id, enrollmentId, studentId, fee / upcoming.length, mode, source] });
      if (source === 'pass') queries.push(...await this.reserveCredit(studentId, mode, session.starts_at.slice(0, 10), `lesson:${bookingId}`, bookingId, planned));
      else queries.push({ sql: "UPDATE learning_credit_events SET status = 'released', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'", values: [`lesson:${bookingId}`] });
      queries.push(old
        ? { sql: "UPDATE class_attendance SET status = 'pending', note = '', marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?", values: [bookingId] }
        : { sql: "INSERT INTO class_attendance (id, student_booking_id, status, note) VALUES (?, ?, 'pending', '')", values: [`attendance:${bookingId}`, bookingId] });
    }
    if (source === 'pass') queries.push({ sql: "UPDATE class_enrollments SET pass_id = COALESCE(?, (SELECT pass_id FROM learning_credit_events WHERE booking_id IN (SELECT id FROM class_student_bookings WHERE enrollment_id = ?) AND status = 'reserved' LIMIT 1)) WHERE id = ?", values: [planned.keys().next().value || null, enrollmentId, enrollmentId] });
    else queries.push({ sql: 'UPDATE class_enrollments SET pass_id = NULL WHERE id = ?', values: [enrollmentId] });
    const invoiceId = source === 'course' ? `${enrollmentId}:invoice` : '';
    if (invoiceId) queries.push({ sql: "INSERT INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at) VALUES (?, ?, ?, ?, ?, 0, 'unpaid', CURRENT_TIMESTAMP, ?) ON CONFLICT(id) DO NOTHING", values: [invoiceId, `INV-${enrollmentId}`, enrollmentId, studentId, fee, malaysiaDay(this.now())] });
    await this.batch(queries);
    return { enrollmentId, invoiceId };
  }

  async markAttendance(bookingId: string, status: string, note = '') {
    if (!['pending', 'present', 'late', 'absent', 'leave'].includes(status)) throw new Error('Choose a valid attendance status.');
    const booking = await this.one<{ student_id: string; payment_source: string; delivery_mode: CreditType; starts_at: string; enrollment_id: string; pass_id: string | null }>(`SELECT b.*, s.starts_at, e.pass_id FROM class_student_bookings b JOIN class_sessions s ON s.id = b.class_session_id JOIN class_enrollments e ON e.id = b.enrollment_id WHERE b.id = ? AND b.status = 'booked' AND s.status != 'cancelled'`, [bookingId]);
    if (!booking) throw new Error('This lesson booking is no longer active.');
    const attending = ['present', 'late'].includes(status);
    if (attending && booking.starts_at.replace('T', ' ') > malaysiaTime(this.now())) throw new Error('Attendance opens when the lesson starts.');
    const usesPass = booking.payment_source === 'pass';
    const eventId = `lesson:${bookingId}`;
    const queries: Query[] = [];
    if (usesPass && attending && booking.delivery_mode !== 'online') {
      const legacy = await this.one('SELECT id FROM pass_credit_uses WHERE student_booking_id = ?', [bookingId]);
      if (!legacy) {
        queries.push(...await this.reserveCredit(booking.student_id, 'onsite', booking.starts_at.slice(0, 10), eventId, bookingId));
        queries.push({ sql: "UPDATE learning_credit_events SET status = 'consumed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'", values: [eventId] });
      }
    }
    if (!usesPass && attending) {
      const invoice = await this.one<{ status: string }>('SELECT status FROM student_invoices WHERE enrollment_id = ?', [booking.enrollment_id]);
      if (invoice?.status !== 'paid') throw new Error('Complete course payment before checking in.');
    }
    if (!attending && ['leave', 'pending'].includes(status)) {
      queries.push({ sql: "UPDATE learning_credit_events SET status = 'released', updated_at = CURRENT_TIMESTAMP WHERE id = ?", values: [eventId] });
    }
    queries.push({ sql: "UPDATE class_attendance SET status = ?, note = ?, marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?", values: [status, note.trim(), bookingId] });
    await this.batch(queries);
  }

  async cancelLesson(studentId: string, sessionId: string, note = '') {
    const booking = await this.one<{ id: string; starts_at: string; status: string }>('SELECT b.id, b.status, s.starts_at FROM class_student_bookings b JOIN class_sessions s ON s.id = b.class_session_id WHERE b.student_id = ? AND s.id = ?', [studentId, sessionId]);
    if (!booking) throw new Error('Lesson booking not found.');
    if (booking.status !== 'booked') return;
    if (booking.starts_at.replace('T', ' ') <= malaysiaTime(this.now())) throw new Error('This lesson has started. Please contact the campus.');
    await this.batch([
      { sql: "UPDATE class_student_bookings SET status = 'cancelled' WHERE id = ?", values: [booking.id] },
      { sql: "UPDATE learning_credit_events SET status = 'released', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'", values: [`lesson:${booking.id}`] },
      { sql: "UPDATE class_attendance SET status = 'leave', note = ?, marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?", values: [note.trim() || 'Requested by student', booking.id] },
    ]);
  }

  async joinOnline(studentId: string, sessionId: string) {
    const lesson = await this.one<{ id: string; starts_at: string; ends_at: string; online_url: string; payment_source: string; enrollment_id: string }>("SELECT b.id, b.payment_source, b.enrollment_id, s.starts_at, s.ends_at, s.online_url FROM class_student_bookings b JOIN class_sessions s ON s.id = b.class_session_id WHERE b.student_id = ? AND s.id = ? AND b.status = 'booked' AND b.delivery_mode = 'online' AND s.status != 'cancelled'", [studentId, sessionId]);
    if (!lesson) throw new Error('Book this online lesson first.');
    let url: URL;
    try { url = new URL(lesson.online_url); } catch { throw new Error('The teacher has not added a classroom link yet. No credit was used.'); }
    if (url.protocol !== 'https:') throw new Error('The teacher needs to add a secure classroom link.');
    const now = malaysiaTime(this.now());
    const opens = new Date(`${lesson.starts_at.replace(' ', 'T')}+08:00`).getTime() - 15 * 60_000;
    if (this.now().getTime() < opens || now > lesson.ends_at.replace('T', ' ')) throw new Error('Join from 15 minutes before the lesson until it ends.');
    if (lesson.payment_source === 'pass') await this.consumeCredit(studentId, 'online', `lesson:${lesson.id}`, lesson.id);
    else {
      const invoice = await this.one<{ status: string }>('SELECT status FROM student_invoices WHERE enrollment_id = ?', [lesson.enrollment_id]);
      if (invoice?.status !== 'paid') throw new Error('Complete course payment before joining.');
    }
    return url.href;
  }

  async payInvoice(input: { invoiceId: string; requestKey: string; amount?: number; discount?: number; method?: string; reference?: string; note?: string }) {
    const invoice = await this.one<{ student_id: string; total_amount: number; paid_amount: number }>('SELECT * FROM student_invoices WHERE id = ?', [input.invoiceId]);
    if (!invoice) throw new Error('Invoice not found.');
    const id = `${input.invoiceId}:${input.requestKey}`;
    if (await this.one('SELECT id FROM student_payments WHERE id = ?', [id])) return;
    const remaining = Math.round((invoice.total_amount - invoice.paid_amount) * 100) / 100;
    if (remaining <= 0) return;
    const discount = input.discount ?? 0;
    const amount = input.amount ?? remaining - discount;
    if (!Number.isFinite(amount) || !Number.isFinite(discount) || discount < 0 || discount > remaining || amount <= 0 || amount > remaining - discount) throw new Error('Enter a payment within the remaining balance.');
    await this.batch([
      { sql: "UPDATE student_invoices SET total_amount = total_amount - ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM student_payments WHERE id = ?)", values: [discount, input.invoiceId, id] },
      { sql: "INSERT INTO student_payments (id, invoice_id, student_id, amount, method, proof_reference, note, received_at) SELECT ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM student_payments WHERE id = ?)", values: [id, input.invoiceId, invoice.student_id, amount, input.method || 'cash', input.reference || '', input.note || '', id] },
    ]);
  }

  async bookStudy(studentId: string, roomId: string, start: string, end: string, requestKey: string) {
    if (!/^[\w-]{8,100}$/.test(requestKey)) throw new Error('Refresh this booking and try again.');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(end)) throw new Error('Choose a valid study time.');
    const duration = (new Date(end.replace(' ', 'T') + '+08:00').getTime() - new Date(start.replace(' ', 'T') + '+08:00').getTime()) / 60000;
    if (start <= malaysiaTime(this.now()) || start.slice(0, 10) !== end.slice(0, 10) || !Number.isFinite(duration) || duration < 30 || duration > 240) throw new Error('Choose an upcoming study visit lasting 30 to 240 minutes.');
    if (!await this.one("SELECT id FROM classrooms WHERE id = ? AND status = 'active'", [roomId])) throw new Error('Choose an available room.');
    const id = `study:${studentId}:${requestKey}`;
    if (await this.one('SELECT id FROM study_bookings WHERE id = ?', [id])) return;
    const queries = await this.reserveCredit(studentId, 'study', start.slice(0, 10), id, id);
    queries.push({ sql: "INSERT INTO study_bookings (id, student_id, classroom_id, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)", values: [id, studentId, roomId, start, end] });
    await this.batch(queries);
  }

  async updateStudy(studentId: string, id: string, cancel: boolean) {
    const booking = await this.one<{ status: string; starts_at: string; ends_at: string }>('SELECT * FROM study_bookings WHERE id = ? AND student_id = ?', [id, studentId]);
    if (!booking) throw new Error('Study booking not found.');
    if (booking.status !== 'booked') return;
    const now = malaysiaTime(this.now());
    if (cancel && now >= booking.starts_at) throw new Error('This visit has started. Please contact the campus.');
    if (!cancel && (now < booking.starts_at || now > booking.ends_at)) throw new Error('Check in during your booked study time.');
    await this.batch([
      { sql: "UPDATE learning_credit_events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'", values: [cancel ? 'released' : 'consumed', id] },
      { sql: 'UPDATE study_bookings SET status = ? WHERE id = ?', values: [cancel ? 'cancelled' : 'present', id] },
    ]);
  }
}
