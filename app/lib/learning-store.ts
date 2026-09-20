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
  issuance_mode?: 'balance' | 'tickets';
};
type Window = { from: string; until: string };
type Snapshot = { product: Offer; windows: Window[]; billing?: { enrollmentId: string; month: string; dueAt: string; payMonthly: boolean; extraOnsite: number; extraUnitPrice: number; extraNeeded: number; basePrice: number }; booking?: { runId: string; sessionId?: string; sessionIds?: string[]; mode: 'onsite' | 'online'; autoBook?: boolean } };

export function courseMonthlySchedule(product: RecordData, dates: string[], mode: 'onsite' | 'online', today: string) {
  const days = dates.map(date => date.slice(0, 10)).sort();
  if (!days.length) return [];
  const periods = monthCount(days[0], days[days.length - 1]);
  return passWindows({ validity_type: 'calendar_month', validity_days: 30 }, days[0], periods).map(window => {
    const month = window.from.slice(0, 7);
    const lessons = days.filter(day => day >= window.from && day <= window.until).length;
    return { ...window, month, lessons, included: Number(product[`${mode}_credits`]), extra: Math.max(0, lessons - Number(product[`${mode}_credits`])), dueAt: `${month}-07` < today ? today : `${month}-07` };
  });
}

export function extraOnsiteUnitPrice(products: RecordData[]) {
  const product = products.find(item => item.status === 'active' && Number(item.onsite_credits) > 0 && !Number(item.online_credits) && !Number(item.study_credits));
  return product ? Math.round(Number(product.price) / Number(product.onsite_credits) * 100) / 100 : null;
}

export function passOrderNotice(order: RecordData, today = malaysiaDay()) {
  if (order.status === 'paid') return order.valid_until && String(order.valid_until) < today ? 'Paid pass expired' : '';
  // Monthly bills are existing debts, not a new purchase of the old course.
  if (order.enrollment_id || order.plan_key) return '';
  if (order.selected_run_id && ['finished', 'cancelled'].includes(String(order.run_status))) return 'Previous class is no longer available. Choose a current course.';
  if (order.selected_run_id && order.upcoming_lessons != null && Number(order.upcoming_lessons) === 0) return 'No upcoming lessons. Choose a current course.';
  if (order.valid_until && String(order.valid_until) < today) return 'This offer has expired. Choose a new course plan.';
  return '';
}

export function malaysiaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function malaysiaTime(now = new Date()) {
  return `${malaysiaDay(now)} ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now)}`;
}

export const ONLINE_EARLY_JOIN_MINUTES = 15;
export const LEAVE_REFUND_HOURS = 48;
export function leavePolicy(startsAt: string, now = Date.now()) {
  const starts = new Date(startsAt.replace(' ', 'T') + '+08:00').getTime();
  const refundable = starts - now >= LEAVE_REFUND_HOURS * 3600000;
  return { refundable, message: refundable ? 'At least 48 hours before class: your reserved point will be returned.' : 'Less than 48 hours before class: your point will not be returned.' };
}

export function gradeCode(value: unknown) {
  const text = String(value ?? '').toUpperCase();
  return text.match(/\b(?:G[1-6]|F[1-5]|L[1-3]|H[1-3]|Y(?:1[0-3]|[1-9]))\b/)?.[0]
    || (text.match(/\bYEAR\s+(1[0-3]|[1-9])\b/) ? 'Y' + text.match(/\bYEAR\s+(1[0-3]|[1-9])\b/)![1] : '');
}

export function onlineLessonState(session: RecordData, now = Date.now()) {
  const time = (value: unknown) => new Date(String(value ?? '').replace(' ', 'T') + '+08:00').getTime();
  const starts = time(session.starts_at), ends = time(session.ends_at);
  if (['cancelled', 'completed'].includes(String(session.status)) || !Number.isFinite(starts) || !Number.isFinite(ends) || now >= ends) return 'ended';
  if (now < starts - ONLINE_EARLY_JOIN_MINUTES * 60_000) return 'upcoming';
  try { if (new URL(String(session.online_url)).protocol !== 'https:') return 'link_pending'; }
  catch { return 'link_pending'; }
  return now < starts ? 'opening' : 'live';
}

export function lessonAvailability(session: RecordData, capacity: number, bookings: RecordData[], studentId: string, mode: 'onsite' | 'online', now = Date.now()) {
  const own = bookings.find(b => b.student_id === studentId && b.class_session_id === session.id && b.status === 'booked');
  const seats = mode === 'online' ? null : Math.max(0, capacity - bookings.filter(b => b.class_session_id === session.id && b.status === 'booked' && b.delivery_mode === 'onsite').length);
  const state = onlineLessonState(session, now);
  const started = now >= new Date(String(session.starts_at).replace(' ', 'T') + '+08:00').getTime();
  let reason = '';
  if (state === 'ended') reason = session.status === 'cancelled' ? 'Cancelled' : 'Ended';
  else if (own && own.delivery_mode !== mode) reason = `Booked ${own.delivery_mode}`;
  else if (mode === 'onsite' && started) reason = 'Already started';
  else if (mode === 'online' && state === 'link_pending') reason = 'Classroom link pending';
  else if (!own && mode === 'onsite' && seats === 0) reason = 'Full';
  return { booked: Boolean(own), seats, state, reason, disabled: Boolean(reason) };
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

export function coursePassWindows(product: RecordData, dates: string[], type: 'onsite' | 'online', anchor: string): Window[] {
  const quota = Number(product[`${type}_credits`]);
  if (!Number.isInteger(quota) || quota < 1) throw new Error('This pass does not include the selected lesson type.');
  const days = dates.map(date => date.slice(0, 10)).sort();
  if (!days.length) return [];
  if (anchor > days[0]) throw new Error('Start the pass on or before your first lesson.');
  const windows: Window[] = [];
  let index = 0;
  while (index < days.length) {
    const window = passWindows({ validity_type: String(product.validity_type), validity_days: Number(product.validity_days) }, windows.length ? days[index] : anchor, 1)[0];
    if (window.until < days[index]) throw new Error('The pass expires before your first lesson. Choose a later start date.');
    windows.push(window);
    let used = 0;
    while (index < days.length && days[index] <= window.until && used < quota) { index++; used++; }
  }
  return windows;
}

export function passOfferCards(product: RecordData, anchor: string, months: number, windows?: Window[]): RecordData[] {
  return (windows ?? passWindows({ validity_type: String(product.validity_type), validity_days: Number(product.validity_days) }, anchor, months))
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

  async createPassOrder(input: { studentId: string; productId: string; requestKey: string; months: number; start?: string; runId?: string; sessionId?: string; mode?: string; reserveSelection?: boolean; coursePlan?: boolean; payMonthly?: boolean; includeExtraOnsite?: boolean }) {
    if (input.coursePlan && input.runId && !input.sessionId) return this.createCourseBillingPlan({ ...input, runId: input.runId });
    if (!input.studentId || !/^[\w-]{8,100}$/.test(input.requestKey)) throw new Error('Refresh this purchase and try again.');
    const requestKey = `${input.studentId}:${input.requestKey}`;
    const old = await this.one<{ id: string }>('SELECT id FROM pass_orders WHERE request_key = ?', [requestKey]);
    if (old) return old.id;
    const product = await this.one<Offer>("SELECT * FROM pass_products WHERE id = ? AND status = 'active'", [input.productId]);
    if (!product || !await this.one('SELECT id FROM students WHERE id = ?', [input.studentId])) throw new Error('Choose an available pass and learner.');
    const today = malaysiaDay(this.now());
    const anchor = input.start?.slice(0, 10) || today;
    if (product.validity_type === 'rolling_days' && anchor < today) throw new Error('Choose today or a future start date.');
    let windows = passWindows(product, anchor, input.coursePlan ? 1 : input.months);
    if (input.coursePlan) {
      if (!input.runId) throw new Error('Choose a course first.');
      const planned = await this.all<{ starts_at: string }>("SELECT starts_at FROM class_sessions s WHERE class_run_id = ? AND (? IS NULL OR id = ?) AND status NOT IN ('cancelled','completed') AND starts_at > ? AND NOT EXISTS (SELECT 1 FROM class_student_bookings b WHERE b.class_session_id = s.id AND b.student_id = ? AND b.status = 'booked' AND b.delivery_mode = ?) ORDER BY starts_at", [input.runId, input.sessionId || null, input.sessionId || null, malaysiaTime(this.now()), input.studentId, input.mode === 'online' ? 'online' : 'onsite']);
      windows = coursePassWindows(product, planned.map(session => session.starts_at), input.mode === 'online' ? 'online' : 'onsite', anchor);
      if (!windows.length) throw new Error('This course has no upcoming lessons.');
      if (input.payMonthly) windows = windows.slice(0, 1);
    }
    if (windows[0].until < today) throw new Error('Choose the current month or a future month.');
    const selectedRun = input.runId ? await this.one<{ status: string }>('SELECT status FROM class_runs WHERE id = ?', [input.runId]) : null;
    if (input.runId && !selectedRun) throw new Error('Class not found.');
    const orderId = uid('pass-order');
    const packageId = `${orderId}:package`;
    const snapshot: Snapshot = { product, windows };
    if (input.runId) {
      const mode = input.mode === 'online' ? 'online' : 'onsite';
      const sessions = await this.all<{ id: string; starts_at: string }>("SELECT id, starts_at FROM class_sessions WHERE class_run_id = ? AND status NOT IN ('cancelled','completed') AND starts_at > ? ORDER BY starts_at", [input.runId, malaysiaTime(this.now())]);
      let selected = input.sessionId ? sessions.filter(session => session.id === input.sessionId) : sessions;
      const booked = await this.all<{ class_session_id: string; delivery_mode: string }>("SELECT class_session_id, delivery_mode FROM class_student_bookings WHERE student_id = ? AND status = 'booked'", [input.studentId]);
      if (input.coursePlan && input.payMonthly) selected = selected.filter(session => !booked.some(booking => booking.class_session_id === session.id) && session.starts_at.slice(0, 10) >= windows[0].from && session.starts_at.slice(0, 10) <= windows[0].until).slice(0, product[`${mode}_credits`]);
      const sessionIds = input.coursePlan && input.payMonthly ? selected.map(session => session.id) : undefined;
      const modeConflict = selected.some(session => booked.some(booking => booking.class_session_id === session.id && booking.delivery_mode !== mode));
      const dates = selected.filter(session => !booked.some(booking => booking.class_session_id === session.id)).map(session => session.starts_at);
      const cards = await this.all(`SELECT p.*, p.${mode}_remaining - (SELECT COUNT(*) FROM learning_credit_events e WHERE e.pass_id = p.id AND e.status = 'reserved') AS ${mode}_available FROM student_passes p WHERE student_id = ? AND credit_type = ? AND status = 'active'`, [input.studentId, mode]);
      const autoBook = input.reserveSelection !== false && !['cancelled', 'finished'].includes(selectedRun!.status) && !modeConflict && dates.length > 0 && creditCoverage([...cards, ...passOfferCards(product, anchor, input.months, windows)], dates, mode).missing === 0;
      if (autoBook) await this.assertBookingAvailable(input.studentId, input.runId, input.sessionId, mode, sessionIds);
      snapshot.booking = { runId: input.runId, sessionId: input.sessionId || undefined, sessionIds, mode, autoBook };
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

  async createCourseBillingPlan(input: { studentId: string; productId: string; requestKey: string; runId: string; mode?: string; payMonthly?: boolean; includeExtraOnsite?: boolean }) {
    if (!/^[\w-]{8,100}$/.test(input.requestKey)) throw new Error('Refresh this purchase and try again.');
    const prior = await this.one<{ id: string }>('SELECT id FROM pass_orders WHERE plan_key = ? ORDER BY billing_month LIMIT 1', [`${input.studentId}:${input.requestKey}`]);
    if (prior) return prior.id;
    const product = await this.one<Offer>("SELECT * FROM pass_products WHERE id = ? AND status = 'active'", [input.productId]);
    if (!product || !await this.one('SELECT id FROM students WHERE id = ?', [input.studentId])) throw new Error('Choose an available pass and learner.');
    const mode = input.mode === 'online' ? 'online' : 'onsite';
    const existing = await this.one<{ id: string }>('SELECT id FROM class_enrollments WHERE student_id = ? AND class_run_id = ?', [input.studentId, input.runId]);
    if (existing && await this.one('SELECT id FROM pass_orders WHERE enrollment_id = ? LIMIT 1', [existing.id])) throw new Error('This course is already reserved. Open your monthly bills to pay.');
    await this.assertBookingAvailable(input.studentId, input.runId, undefined, mode);
    const sessions = await this.all<{ id: string; starts_at: string }>("SELECT id, starts_at FROM class_sessions WHERE class_run_id = ? AND status NOT IN ('cancelled','completed') AND starts_at > ? ORDER BY starts_at", [input.runId, malaysiaTime(this.now())]);
    const existingBookings = await this.all<{ id: string; class_session_id: string; status: string }>('SELECT id, class_session_id, status FROM class_student_bookings WHERE student_id = ? AND class_session_id IN (SELECT id FROM class_sessions WHERE class_run_id = ?)', [input.studentId, input.runId]);
    if (existingBookings.some(booking => booking.status === 'booked')) throw new Error('Some lessons are already booked. Ask the campus to review this course before starting a new payment plan.');
    const schedule = courseMonthlySchedule(product, sessions.map(session => session.starts_at), mode, malaysiaDay(this.now()));
    const unitPrice = extraOnsiteUnitPrice(await this.all('SELECT * FROM pass_products'));
    if (input.includeExtraOnsite && mode === 'onsite' && schedule.some(month => month.extra) && unitPrice == null) throw new Error('The campus must set the extra onsite lesson price first.');
    const enrollmentId = existing?.id || uid('enrollment');
    const planKey = `${input.studentId}:${input.requestKey}`;
    const fee = schedule.reduce((total, month) => total + product.price + (mode === 'onsite' && input.includeExtraOnsite ? month.extra * (unitPrice || 0) : 0), 0);
    const queries: Query[] = [{
      sql: existing ? "UPDATE class_enrollments SET status = 'enrolled', contracted_fee = ?, delivery_mode = ? WHERE id = ?" : "INSERT INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, delivery_mode) VALUES (?, ?, ?, ?, 'enrolled', ?)",
      values: existing ? [fee, mode, enrollmentId] : [enrollmentId, input.runId, input.studentId, fee, mode],
    }];
    let firstOrderId = '';
    for (const month of schedule) {
      const orderId = uid('pass-order');
      firstOrderId ||= orderId;
      const extra = mode === 'onsite' && input.includeExtraOnsite ? month.extra : 0;
      const snapshot: Snapshot = { product: { ...product, onsite_credits: product.onsite_credits + extra }, windows: [{ from: month.from, until: month.until }], billing: { enrollmentId, month: month.month, dueAt: month.dueAt, payMonthly: Boolean(input.payMonthly), extraOnsite: extra, extraUnitPrice: unitPrice || 0, extraNeeded: mode === 'onsite' ? month.extra : 0, basePrice: product.price }, booking: { runId: input.runId, mode, autoBook: false } };
      queries.push(
        { sql: "INSERT INTO student_passes (id, order_id, student_id, product_id, name, credit_type, valid_from, valid_until, status) VALUES (?, ?, ?, ?, ?, 'package', ?, ?, 'pending_payment')", values: [`${orderId}:package`, orderId, input.studentId, product.id, product.name, month.from, month.until] },
        { sql: "INSERT INTO pass_orders (id, pass_id, student_id, product_id, selected_run_id, delivery_mode, reservation_months, total_amount, paid_amount, status, offer_snapshot, request_key, enrollment_id, billing_month, due_at, plan_key) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 'unpaid', ?, ?, ?, ?, ?, ?)", values: [orderId, `${orderId}:package`, input.studentId, product.id, input.runId, mode, Math.round((product.price + extra * (unitPrice || 0)) * 100) / 100, JSON.stringify(snapshot), `${planKey}:${month.month}`, enrollmentId, month.month, month.dueAt, planKey] },
      );
    }
    for (const session of sessions) {
      const old = existingBookings.find(booking => booking.class_session_id === session.id);
      const bookingId = old?.id || `${input.studentId}:${session.id}`;
      queries.push(old
        ? { sql: "UPDATE class_student_bookings SET enrollment_id = ?, status = 'booked', delivery_mode = ?, payment_source = 'pass', allocated_fee = 0 WHERE id = ?", values: [enrollmentId, mode, bookingId] }
        : { sql: "INSERT INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status, delivery_mode, payment_source) VALUES (?, ?, ?, ?, 0, 'booked', ?, 'pass')", values: [bookingId, session.id, enrollmentId, input.studentId, mode] });
      queries.push({ sql: "INSERT INTO class_attendance (id, student_booking_id, status, note) SELECT ?, ?, 'pending', '' WHERE NOT EXISTS (SELECT 1 FROM class_attendance WHERE student_booking_id = ?)", values: [`attendance:${bookingId}`, bookingId, bookingId] });
    }
    try { await this.batch(queries); } catch (error) {
      const retry = await this.one<{ id: string }>('SELECT id FROM pass_orders WHERE plan_key = ? ORDER BY billing_month LIMIT 1', [planKey]);
      if (retry) return retry.id;
      throw error;
    }
    return firstOrderId;
  }

  async completePassBooking(orderId: string) {
    const order = await this.one<{ student_id: string; selected_run_id: string; delivery_mode: string; offer_snapshot: string; status: string }>('SELECT * FROM pass_orders WHERE id = ?', [orderId]);
    if (!order || order.status !== 'paid') throw new Error('Complete pass payment before booking.');
    const snapshot: Snapshot | null = order.offer_snapshot ? JSON.parse(order.offer_snapshot) : null;
    if (snapshot?.billing) return true;
    const booking = snapshot?.booking || (order.selected_run_id ? { runId: order.selected_run_id, mode: order.delivery_mode === 'online' ? 'online' as const : 'onsite' as const } : null);
    if (!booking) return false;
    if ('autoBook' in booking && booking.autoBook === false) return false;
    if ('sessionIds' in booking && booking.sessionIds) await this.enrollCourse(order.student_id, booking.runId, booking.mode, 'pass', undefined, booking.sessionIds);
    else if ('sessionId' in booking && booking.sessionId) await this.bookLesson(order.student_id, booking.sessionId, booking.mode);
    else await this.enrollCourse(order.student_id, booking.runId, booking.mode, 'pass');
    return true;
  }

  async addCourseExtra(orderId: string) {
    const order = await this.one<RecordData>('SELECT * FROM pass_orders WHERE id = ?', [orderId]);
    if (!order?.offer_snapshot) throw new Error('Monthly bill not found.');
    const snapshot: Snapshot = JSON.parse(String(order.offer_snapshot));
    const bill = snapshot.billing;
    if (!bill || bill.extraNeeded <= bill.extraOnsite || snapshot.booking?.mode !== 'onsite') throw new Error('This bill does not need extra onsite credits.');
    const extraId = `${orderId}:extra`;
    if (await this.one('SELECT id FROM pass_orders WHERE id = ?', [extraId])) return extraId;
    if (!(bill.extraUnitPrice > 0)) throw new Error('The campus must set the extra onsite lesson price first.');
    const count = bill.extraNeeded - bill.extraOnsite;
    const extra: Snapshot = { ...snapshot, product: { ...snapshot.product, onsite_credits: count, online_credits: 0, study_credits: 0 }, billing: { ...bill, extraOnsite: count, extraNeeded: count, basePrice: 0, payMonthly: true } };
    await this.batch([
      { sql: "INSERT INTO student_passes (id, order_id, student_id, product_id, name, credit_type, valid_from, valid_until, status) VALUES (?, ?, ?, ?, 'Extra onsite lesson', 'package', ?, ?, 'pending_payment') ON CONFLICT(id) DO NOTHING", values: [`${extraId}:package`, extraId, order.student_id, order.product_id, snapshot.windows[0].from, snapshot.windows[0].until] },
      { sql: "INSERT INTO pass_orders (id, pass_id, student_id, product_id, selected_run_id, delivery_mode, reservation_months, total_amount, paid_amount, status, offer_snapshot, request_key, enrollment_id, billing_month, due_at) VALUES (?, ?, ?, ?, ?, 'onsite', 1, ?, 0, 'unpaid', ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING", values: [extraId, `${extraId}:package`, order.student_id, order.product_id, order.selected_run_id, Math.round(count * bill.extraUnitPrice * 100) / 100, JSON.stringify(extra), extraId, bill.enrollmentId, `${bill.month}:extra`, bill.dueAt] },
    ]);
    return extraId;
  }

  async assertCourseBillPaid(enrollmentId: string, day: string) {
    const due = await this.one<{ due_at: string }>("SELECT due_at FROM pass_orders WHERE enrollment_id = ? AND (billing_month = ? OR due_at < ?) AND status != 'paid' ORDER BY due_at LIMIT 1", [enrollmentId, day.slice(0, 7), malaysiaDay(this.now())]);
    if (due) throw new Error(`Pay the course bill for ${day.slice(0, 7)} before attending. Payment due ${due.due_at}; your place is still reserved.`);
  }

  async assertBookingAvailable(studentId: string, runId: string, sessionId: string | undefined, mode: 'onsite' | 'online', sessionIds?: string[]) {
    const check = await this.one<{ total: number; blocked: number }>(`SELECT COUNT(*) AS total, SUM(CASE WHEN
      NOT EXISTS (SELECT 1 FROM class_student_bookings own WHERE own.student_id = ? AND own.class_session_id = s.id AND own.status = 'booked') AND (
        (? = 'onsite' AND (SELECT COUNT(*) FROM class_student_bookings b WHERE b.class_session_id = s.id AND b.delivery_mode = 'onsite' AND b.status = 'booked') >= r.capacity)
        OR EXISTS (SELECT 1 FROM class_student_bookings b JOIN class_sessions other ON other.id = b.class_session_id WHERE b.student_id = ? AND b.status = 'booked' AND other.status != 'cancelled' AND other.id != s.id AND other.starts_at < s.ends_at AND other.ends_at > s.starts_at)
        OR EXISTS (SELECT 1 FROM study_bookings b WHERE b.student_id = ? AND b.status != 'cancelled' AND b.starts_at < s.ends_at AND b.ends_at > s.starts_at)
      ) THEN 1 ELSE 0 END) AS blocked
      FROM class_sessions s JOIN class_runs r ON r.id = s.class_run_id
      WHERE s.class_run_id = ? AND (? = '' OR s.id = ?) AND (? IS NULL OR s.id IN (SELECT value FROM json_each(?))) AND s.status NOT IN ('cancelled','completed') AND r.status NOT IN ('cancelled','finished') AND s.starts_at > ?`, [studentId, mode, studentId, studentId, runId, sessionId || '', sessionId || '', sessionIds ? JSON.stringify(sessionIds) : null, sessionIds ? JSON.stringify(sessionIds) : null, malaysiaTime(this.now())]);
    if (!check?.total) throw new Error('This selection has no upcoming lessons. No payment was taken.');
    if (check.blocked) throw new Error('A selected lesson is full or overlaps another booking. No payment was taken.');
  }

  async payPass(orderId: string, method = 'cash', reference = '', note = '', deferred?: Query[]) {
    const order = await this.one<RecordData & { id: string; student_id: string; product_id: string; pass_id: string; offer_snapshot: string; reservation_months: number; total_amount: number; status: string; fulfilled_at: string | null }>("SELECT * FROM pass_orders WHERE id = ?", [orderId]);
    if (!order) throw new Error('Pass order not found.');
    if (order.fulfilled_at) return;
    if (order.status !== 'paid' && !order.enrollment_id && !order.plan_key) {
      const validity = await this.one<RecordData>('SELECT valid_from, valid_until FROM student_passes WHERE id = ?', [order.pass_id]);
      const run = order.selected_run_id ? await this.one<RecordData>('SELECT status AS run_status FROM class_runs WHERE id = ?', [order.selected_run_id]) : null;
      const notice = passOrderNotice({ ...order, ...validity, ...run }, malaysiaDay(this.now()));
      if (notice) throw new Error(`${notice} No payment was taken.`);
    }
    if (!deferred && order.plan_key) {
      const plan: Snapshot = JSON.parse(order.offer_snapshot);
      const orders = plan.billing?.payMonthly ? [{ id: orderId }] : await this.all<{ id: string }>("SELECT id FROM pass_orders WHERE plan_key = ? AND status != 'paid' ORDER BY billing_month", [order.plan_key]);
      const queries: Query[] = [];
      for (const item of orders) await this.payPass(item.id, method, reference, note, queries);
      await this.batch(queries);
      return;
    }
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
    if (snapshot.booking && snapshot.booking.autoBook !== false) await this.assertBookingAvailable(order.student_id, snapshot.booking.runId, snapshot.booking.sessionId, snapshot.booking.mode, snapshot.booking.sessionIds);
    const queries: Query[] = [];
    const issued: { id: string; type: CreditType; remaining: number; from: string; until: string }[] = [];
    for (const window of snapshot.windows) {
      for (const type of ['onsite', 'online', 'study'] as const) {
        const credits = snapshot.product[`${type}_credits`];
        if (!Number.isInteger(credits) || credits < 0) throw new Error('The pass quantities need a staff review.');
        if (!credits) continue;
        const tickets = snapshot.product.issuance_mode === 'tickets';
        for (let index = 0; index < (tickets ? credits : 1); index++) {
          const units = tickets ? 1 : credits;
          const key = `${orderId}:${window.from}:${type}${tickets ? ':' + (index + 1) : ''}`;
          issued.push({ id: key, type, remaining: units, from: window.from, until: window.until });
          queries.push({ sql: "INSERT INTO student_passes (id, order_id, student_id, product_id, name, credit_type, credits_total, valid_from, valid_until, onsite_remaining, online_remaining, study_remaining, status, issuance_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?) ON CONFLICT(issuance_key) WHERE issuance_key IS NOT NULL DO NOTHING", values: [key, orderId, order.student_id, order.product_id, `${snapshot.product.name} - ${type}${tickets ? ' ' + (index + 1) + '/' + credits : ''}`, type, units, window.from, window.until, type === 'onsite' ? units : 0, type === 'online' ? units : 0, type === 'study' ? units : 0, key] });
        }
      }
    }
    if (snapshot.billing && snapshot.booking) {
      const booked = await this.all<{ id: string; starts_at: string; point_penalty: number }>("SELECT b.id, s.starts_at, b.point_penalty FROM class_student_bookings b JOIN class_sessions s ON s.id = b.class_session_id WHERE b.enrollment_id = ? AND (b.status = 'booked' OR b.point_penalty = 1) AND s.status != 'cancelled' AND substr(s.starts_at, 1, 7) = ? ORDER BY s.starts_at", [snapshot.billing.enrollmentId, snapshot.billing.month]);
      for (const booking of booked) {
        if (await this.one("SELECT id FROM learning_credit_events WHERE booking_id = ? AND status IN ('reserved','consumed')", [booking.id])) continue;
        const ticket = issued.find(card => card.type === snapshot.booking!.mode && card.remaining > 0);
        if (!ticket) break;
        ticket.remaining--;
        queries.push({ sql: "INSERT INTO learning_credit_events (id, student_id, pass_id, booking_id, credit_type, service_date, status) SELECT ?, ?, ?, ?, ?, ?, 'reserved' WHERE NOT EXISTS (SELECT 1 FROM learning_credit_events WHERE id = ?)", values: [`lesson:${booking.id}`, order.student_id, ticket.id, booking.id, ticket.type, booking.starts_at.slice(0, 10), `lesson:${booking.id}`] });
        if (booking.point_penalty) queries.push({ sql: "UPDATE learning_credit_events SET status = 'consumed' WHERE id = ? AND status = 'reserved'", values: [`lesson:${booking.id}`] });
      }
      queries.push({ sql: 'UPDATE class_enrollments SET pass_id = COALESCE(pass_id, ?) WHERE id = ?', values: [order.pass_id, snapshot.billing.enrollmentId] });
    }
    queries.push(
      { sql: "INSERT INTO pass_payments (id, order_id, student_id, amount, method, proof_reference, note, received_at) SELECT ?, id, student_id, total_amount, ?, ?, ?, CURRENT_TIMESTAMP FROM pass_orders WHERE id = ? AND status != 'paid' ON CONFLICT(id) DO NOTHING", values: [`${orderId}:payment`, method, reference.trim(), note.trim(), orderId] },
      { sql: "UPDATE student_passes SET status = 'fulfilled' WHERE id = ?", values: [order.pass_id] },
      { sql: "UPDATE pass_orders SET status = 'paid', paid_amount = total_amount, offer_snapshot = ?, fulfilled_at = CURRENT_TIMESTAMP WHERE id = ?", values: [JSON.stringify(snapshot), orderId] },
    );
    if (deferred) deferred.push(...queries);
    else await this.batch(queries);
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

  async enrollCourse(studentId: string, runId: string, mode: 'onsite' | 'online', source: 'pass' | 'course', agreedFee?: number, sessionIds?: string[]) {
    const course = await this.one<{ price: number; status: string }>("SELECT price, status FROM class_runs WHERE id = ? AND status NOT IN ('finished','cancelled')", [runId]);
    if (!course) throw new Error('This class is no longer available.');
    const existing = await this.one<{ id: string; status: string }>('SELECT id, status FROM class_enrollments WHERE class_run_id = ? AND student_id = ?', [runId, studentId]);
    if (existing?.status === 'enrolled') {
      const invoice = await this.one<{ id: string }>('SELECT id FROM student_invoices WHERE enrollment_id = ?', [existing.id]);
      return { enrollmentId: existing.id, invoiceId: invoice?.id || '' };
    }
    const sessions = await this.all<{ id: string; starts_at: string }>("SELECT id, starts_at FROM class_sessions WHERE class_run_id = ? AND status NOT IN ('cancelled','completed') ORDER BY starts_at", [runId]);
    const upcoming = sessions.filter(s => s.starts_at.replace('T', ' ') > malaysiaTime(this.now()) && (!sessionIds || sessionIds.includes(s.id)));
    if (!upcoming.length) throw new Error('There are no upcoming lessons to enrol in.');
    const enrollmentId = existing?.id || uid('enrollment');
    const fee = source === 'pass' ? 0 : Math.round((agreedFee ?? course.price * upcoming.length / sessions.length) * 100) / 100;
    if (!Number.isFinite(fee) || fee < 0) throw new Error('Enter a valid course fee.');
    const queries: Query[] = [{
      sql: existing ? "UPDATE class_enrollments SET status = 'enrolled', contracted_fee = ?, delivery_mode = ? WHERE id = ?" : "INSERT INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, delivery_mode) VALUES (?, ?, ?, ?, 'enrolled', ?)",
      values: existing ? [fee, mode, enrollmentId] : [enrollmentId, runId, studentId, fee, mode],
    }];
    if (sessionIds) queries.push({ sql: "UPDATE class_enrollments SET status = 'single_lesson' WHERE id = ?", values: [enrollmentId] });
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
    if (attending) await this.assertCourseBillPaid(booking.enrollment_id, booking.starts_at.slice(0, 10));
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
    if (status === 'leave' && !leavePolicy(booking.starts_at, this.now().getTime()).refundable) {
      queries.push({ sql: "UPDATE learning_credit_events SET status = 'consumed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'", values: [eventId] });
    } else if (!attending && ['leave', 'pending'].includes(status)) {
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
    const policy = leavePolicy(booking.starts_at, this.now().getTime());
    await this.batch([
      { sql: "UPDATE class_student_bookings SET status = 'cancelled', point_penalty = ? WHERE id = ?", values: [policy.refundable ? 0 : 1, booking.id] },
      { sql: "UPDATE learning_credit_events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'", values: [policy.refundable ? 'released' : 'consumed', `lesson:${booking.id}`] },
      { sql: "UPDATE class_attendance SET status = 'leave', note = ?, marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?", values: [[note.trim() || 'Requested by student', policy.message].join(' '), booking.id] },
    ]);
  }

  async joinOnline(studentId: string, sessionId: string) {
    const session = await this.one<RecordData & { class_run_id: string; online_url: string; starts_at: string; level: string; title: string }>("SELECT s.*, c.level, c.title FROM class_sessions s JOIN class_runs r ON r.id = s.class_run_id JOIN course_catalogs c ON c.id = r.course_id WHERE s.id = ? AND r.status NOT IN ('cancelled','finished')", [sessionId]);
    if (!session) throw new Error('This lesson is no longer available.');
    const state = onlineLessonState(session, this.now().getTime());
    if (state === 'link_pending') throw new Error('The teacher has not added a classroom link yet. No credit was used.');
    if (!['opening', 'live'].includes(state)) throw new Error('Join from 15 minutes before the lesson until it ends.');
    const existing = await this.one<{ id: string; status: string; delivery_mode: string; payment_source: string; enrollment_id: string }>('SELECT * FROM class_student_bookings WHERE student_id = ? AND class_session_id = ?', [studentId, sessionId]);
    if (existing?.status === 'booked') {
      await this.assertCourseBillPaid(existing.enrollment_id, session.starts_at.slice(0, 10));
      if (existing.delivery_mode !== 'online') throw new Error('You already have an onsite place. Contact the campus to change attendance mode.');
      const queries: Query[] = [];
      if (existing.payment_source === 'pass') {
        queries.push(...await this.reserveCredit(studentId, 'online', malaysiaDay(this.now()), `lesson:${existing.id}`, existing.id));
        queries.push({ sql: "UPDATE learning_credit_events SET status = 'consumed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'", values: [`lesson:${existing.id}`] });
      } else {
        const invoice = await this.one<{ status: string }>('SELECT status FROM student_invoices WHERE enrollment_id = ?', [existing.enrollment_id]);
        if (invoice?.status !== 'paid') throw new Error('Complete course payment before joining.');
      }
      queries.push({ sql: "UPDATE class_attendance SET status = 'present', note = 'Joined online', marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?", values: [existing.id] });
      await this.batch(queries);
      return new URL(session.online_url).href;
    }
    const student = await this.one<{ level: string }>('SELECT level FROM students WHERE id = ?', [studentId]);
    const grade = gradeCode(student?.level);
    if (!grade || grade !== gradeCode(session.title + ' ' + session.level)) throw new Error('Choose an online lesson for your grade.');
    const enrollment = await this.one<{ id: string }>('SELECT id FROM class_enrollments WHERE student_id = ? AND class_run_id = ?', [studentId, session.class_run_id]);
    const enrollmentId = enrollment?.id || `dropin:${studentId}:${session.class_run_id}`;
    const bookingId = existing?.id || `${studentId}:${sessionId}`;
    const eventId = `lesson:${bookingId}`;
    const credits = await this.reserveCredit(studentId, 'online', malaysiaDay(this.now()), eventId, bookingId);
    const queries: Query[] = [];
    if (!enrollment) queries.push({ sql: "INSERT INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, delivery_mode) VALUES (?, ?, ?, 0, 'single_lesson', 'online') ON CONFLICT(id) DO NOTHING", values: [enrollmentId, session.class_run_id, studentId] });
    queries.push(existing
      ? { sql: "UPDATE class_student_bookings SET status = 'booked', delivery_mode = 'online', payment_source = 'pass', allocated_fee = 0 WHERE id = ?", values: [bookingId] }
      : { sql: "INSERT INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status, delivery_mode, payment_source) VALUES (?, ?, ?, ?, 0, 'booked', 'online', 'pass') ON CONFLICT(id) DO NOTHING", values: [bookingId, sessionId, enrollmentId, studentId] });
    queries.push(...credits,
      { sql: "UPDATE learning_credit_events SET status = 'consumed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'reserved'", values: [eventId] },
      { sql: "INSERT INTO class_attendance (id, student_booking_id, status, note, marked_at) SELECT ?, ?, 'present', 'Joined online', CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM class_attendance WHERE student_booking_id = ?)", values: [`attendance:${bookingId}`, bookingId, bookingId] },
      { sql: "UPDATE class_attendance SET status = 'present', note = 'Joined online', marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?", values: [bookingId] });
    await this.batch(queries);
    return new URL(session.online_url).href;
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
