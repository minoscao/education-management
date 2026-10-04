import { creditCoverage, malaysiaDay, monthCount, passWindows, gradeCode, type RecordData } from './learning-store';

export type CourseScope = 'full' | 'month' | 'lesson';
export type CourseFunding = 'package' | 'balance' | 'topup' | 'direct';
export type CheckoutSelection = { mode: 'onsite' | 'online'; scope: CourseScope; funding: CourseFunding; payMonthly: boolean; includeExtra: boolean; sessionId?: string };
export function singlePrice(products: RecordData[], type: 'onsite' | 'online' | 'study') {
  const product = products.find(item => item.status === 'active' && Number(item[`${type}_credits`]) > 0 && ['onsite', 'online', 'study'].every(other => other === type || !Number(item[`${other}_credits`])));
  const price = product?.unit_price != null ? Number(product.unit_price) : product ? Number(product.price) / Number(product[`${type}_credits`]) : NaN;
  if (!Number.isFinite(price) || price < 0) throw new Error(`The campus needs to set the ${type} lesson price.`);
  return Math.round(price * 100) / 100;
}

export function courseQuote(products: RecordData[], cards: RecordData[], sessions: RecordData[], selection: CheckoutSelection, today = malaysiaDay()) {
  const product = products.find(item => item.status === 'active' && item.id === 'pass-monthly') || products.find(item => item.status === 'active' && Number(item.onsite_credits) > 0 && (Number(item.online_credits) > 0 || Number(item.study_credits) > 0));
  if (!product) throw new Error('The campus needs to configure its learning pass.');
  const selected = sessions.filter(session => !['cancelled', 'completed'].includes(String(session.status)) && String(session.starts_at).slice(0, 10) >= today
    && (selection.scope !== 'full' || !selection.sessionId || String(session.starts_at) >= String(sessions.find(item => item.id === selection.sessionId)?.starts_at || ''))
    && (selection.scope !== 'month' || String(session.starts_at).slice(0, 7) === today.slice(0, 7))
    && (selection.scope !== 'lesson' || String(session.id) === selection.sessionId)).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  if (!selected.length) throw new Error(selection.scope === 'month' ? 'No lessons remain this month. Choose the full course.' : 'No upcoming lessons are available.');
  const unitPrice = singlePrice(products, selection.mode);
  const dates = selected.map(session => String(session.starts_at));
  const from = dates[0].slice(0, 10), until = dates.at(-1)!.slice(0, 10);
  const availableCards = cards.map(card => ({ ...card }));
  const periods = passWindows({ validity_type: 'calendar_month', validity_days: 30 }, from, monthCount(from, until)).map(window => {
    const lessons = dates.filter(day => day.slice(0, 10) >= window.from && day.slice(0, 10) <= window.until);
    const coverage = creditCoverage(availableCards, lessons, selection.mode);
    // Assign earliest-expiring balances once across the entire plan.
    for (const date of lessons) {
      const card = availableCards.filter(card => card.status === 'active' && card.credit_type === selection.mode && String(card.valid_from) <= date.slice(0, 10) && String(card.valid_until) >= date.slice(0, 10) && Number(card[`${selection.mode}_available`] ?? card[`${selection.mode}_remaining`]) > 0).sort((a, b) => String(a.valid_until).localeCompare(String(b.valid_until)) || String(a.id).localeCompare(String(b.id)))[0];
      if (card) card[`${selection.mode}_available`] = Number(card[`${selection.mode}_available`] ?? card[`${selection.mode}_remaining`]) - 1;
    }
    const usesBalance = ['balance', 'topup', 'direct'].includes(selection.funding);
    const covered = usesBalance ? coverage.covered : 0;
    const missing = lessons.length - covered;
    const quota = Number(product[`${selection.mode}_credits`]);
    if (selection.funding === 'topup' && missing && quota <= 0) throw new Error('This pass does not include the selected lesson type. Choose lessons only.');
    const quantity = selection.funding === 'topup' && missing ? Math.ceil(missing / quota) : selection.funding === 'package' && lessons.length ? 1 : 0;
    const fullPackage = selection.funding === 'topup' || (selection.funding === 'package' && selection.scope === 'full' && selection.mode === 'onsite');
    const extra = fullPackage ? Math.max(0, missing - quantity * quota) : 0;
    const price = selection.funding === 'balance' ? 0 : fullPackage ? Number(product.price) * quantity + (selection.includeExtra ? extra * unitPrice : 0) : missing * unitPrice;
    const credits = fullPackage ? { onsite: Number(product.onsite_credits) * quantity + (selection.includeExtra ? extra : 0), online: Number(product.online_credits) * quantity, study: Number(product.study_credits) * quantity }
      : { onsite: selection.mode === 'onsite' ? missing : 0, online: selection.mode === 'online' ? missing : 0, study: 0 };
    if (!fullPackage && selection.funding === 'package' && selection.mode === 'onsite' && lessons.length) { credits.online = Number(product.online_credits); credits.study = Number(product.study_credits); }
    const paymentMonth = selection.payMonthly ? window.from.slice(0, 7) : from.slice(0, 7);
    return { ...window, month: window.from.slice(0, 7), lessons: lessons.length, covered, missing, quantity, extra, price: Math.round(price * 100) / 100, credits, dueAt: paymentMonth + '-07' < today ? today : paymentMonth + '-07' };
  }).filter(period => period.lessons > 0);
  const total = Math.round(periods.reduce((sum, period) => sum + period.price, 0) * 100) / 100;
  return { product, selected, from, until, months: periods.length, periods, total, dueNow: selection.payMonthly ? periods[0].price : total, unitPrice,
    required: dates.length, covered: periods.reduce((sum, period) => sum + period.covered, 0), missing: periods.reduce((sum, period) => sum + period.missing, 0), extra: periods.reduce((sum, period) => sum + period.extra, 0) };
}

export function recommendationRank(student: RecordData, course: RecordData) {
  const studentGrade = gradeCode(student.level);
  const grade = gradeCode(course.course_title || course.title);
  if (!studentGrade || grade !== studentGrade) return 0;
  const group = String(course.audience_group || course.name || '').toLowerCase();
  const preferred = student.school_type === 'chinese' ? /chinese|华小/ : student.school_type === 'malay' ? /malay|马小/ : null;
  return preferred?.test(group) ? 3 : /mixed|english.medium/.test(group) ? 2 : 1;
}

export function courseBillState(bills: RecordData[], today = malaysiaDay()) {
  const unpaid = bills.filter(bill => bill.status !== 'paid');
  const due = unpaid.filter(bill => {
    let fullPayment = false;
    try { fullPayment = JSON.parse(String(bill.offer_snapshot || '{}')).billing?.payMonthly === false; } catch { /* Older bills may have no snapshot. */ }
    return fullPayment || String(bill.billing_month || '').slice(0, 7) <= today.slice(0, 7);
  });
  return { awaiting: due.length > 0, overdue: due.some(bill => String(bill.due_at || '') < today), remaining: unpaid.reduce((sum, bill) => sum + Number(bill.total_amount) - Number(bill.paid_amount), 0), nextDue: unpaid.sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))[0] };
}
