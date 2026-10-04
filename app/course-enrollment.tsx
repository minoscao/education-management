"use client";
import { useState, type RefObject } from 'react';
import { Building2, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, CreditCard, Plus, School, X } from 'lucide-react';
import { courseQuote, type CourseScope, type CourseFunding } from './lib/course-checkout';
import { creditCoverage, malaysiaDay, type RecordData } from './lib/learning-store';

type Data = { runs: RecordData[]; sessions: RecordData[]; teachers: RecordData[]; passProducts: RecordData[]; passes: RecordData[]; bookings: RecordData[] };
const money = (n: number) => `RM ${n.toFixed(2)}`;
const day = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });

export function CourseEnrollment({ data, studentId, runId, sessionId, mode, onMode, busy, run, onClose, dialogRef }: {
  data: Data; studentId: string; runId: string; sessionId: string; mode: 'onsite' | 'online'; onMode: (mode: 'onsite' | 'online') => void; busy: boolean;
  run: (action: string, values?: RecordData) => Promise<boolean>; onClose: () => void; dialogRef: RefObject<HTMLElement | null>;
}) {
  const [step, setStep] = useState(1);
  const [scope, setScope] = useState<CourseScope>(sessionId ? 'lesson' : 'full');
  const [funding, setFunding] = useState<CourseFunding>(() => data.passes.some(card => card.student_id === studentId && card.status === 'active' && String(card.valid_until) >= malaysiaDay()) ? 'balance' : mode === 'online' || sessionId ? 'direct' : 'package');
  const [payMonthly, setPayMonthly] = useState(false);
  const [includeExtra, setIncludeExtra] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const course = data.runs.find(item => item.id === runId)!;
  const chosenSession = data.sessions.find(item => item.id === sessionId);
  const allSessions = data.sessions.filter(item => item.class_run_id === runId && !['cancelled', 'completed'].includes(String(item.status)) && new Date(String(item.starts_at).replace(' ', 'T') + '+08:00').getTime() > Date.now()
    && (!sessionId || String(item.starts_at) >= String(chosenSession?.starts_at || '')));
  const sessions = allSessions.filter(item => !data.bookings.some(booking => booking.student_id === studentId && booking.class_session_id === item.id && booking.status === 'booked'));
  const cards = data.passes.filter(card => card.student_id === studentId);
  let quote: ReturnType<typeof courseQuote> | null = null;
  let quoteError = '';
  try { quote = courseQuote(data.passProducts, cards, sessions, { mode, scope, funding, payMonthly, includeExtra, sessionId }); } catch (e) { quoteError = e instanceof Error ? e.message : 'Please review your selection.'; }
  const dates = quote?.selected.map(item => String(item.starts_at)) || [];
  const balances = { onsite: creditCoverage(cards, dates, 'onsite'), online: creditCoverage(cards, dates, 'online') };
  const teacher = data.teachers.find(item => item.id === (chosenSession?.teacher_id || course.teacher_id));
  const actualFunding = funding === 'balance' && quote?.missing === 0 ? 'balance' : funding;
  async function confirm() {
    if (!quote) return;
    setError('');
    if (await run('checkoutCourse', { studentId, runId, sessionId: sessionId || undefined, deliveryMode: mode, courseScope: scope, courseFunding: actualFunding, payMonthly: scope === 'full' && payMonthly, includeExtraOnsite: includeExtra, requestKey })) setDone(true);
    else setError('Your reservation was not completed. Review the message and try again.');
  }
  function chooseFunding(value: CourseFunding) { setFunding(value); setIncludeExtra(false); setError(''); }
  return <div className="payment-dialog-backdrop" onMouseDown={() => { if (!busy) onClose(); }}><section ref={dialogRef} className="course-booking-dialog course-enrollment" role="dialog" aria-modal="true" aria-label="Course enrolment" onMouseDown={event => event.stopPropagation()}>
    <header><div><span>{done ? 'RESERVATION SAVED' : 'CHOOSE YOUR COURSE'}</span><h3>{String(course.course_title || course.name)}</h3><p>{String(course.name || '')}</p>{!done ? <small>Step {step} of 3 · {step === 1 ? 'How will you attend?' : step === 2 ? 'Choose your plan' : 'Review & reserve'}</small> : null}</div><button type="button" className="header-icon" aria-label="Close" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <main>{teacher ? <div className="booking-teacher">{teacher.avatar_url ? <img src={String(teacher.avatar_url)} alt={String(teacher.name)} /> : null}<div><strong>{String(teacher.name)}</strong><p>{String(teacher.bio || '')}</p></div></div> : null}
      {done ? <section className="booking-already-purchased"><Check size={24} /><div><strong>{actualFunding === 'balance' ? 'Your lessons are booked' : 'Your place is reserved'}</strong><p>{actualFunding === 'balance' ? 'Your pass credits are reserved for these lesson dates.' : 'Awaiting campus payment confirmation. Your timetable and bills are ready.'}</p><small>{scope === 'month' ? 'Only this month is reserved.' : scope === 'lesson' ? 'One lesson is reserved.' : 'All selected course lessons are reserved.'}</small></div></section> : <>
      {quoteError || error ? <p className="dialog-error" role="alert">{error || quoteError}</p> : null}
      {step === 1 ? <section className="booking-delivery" aria-label="Attendance mode">{(['onsite','online'] as const).map(value => <button type="button" key={value} className={mode === value ? 'selected' : ''} aria-pressed={mode === value} disabled={busy} onClick={() => { onMode(value); if (funding !== 'balance') setFunding(value === 'online' || sessionId ? 'direct' : 'package'); setIncludeExtra(false); }}>{value === 'onsite' ? <Building2 size={24} /> : <BookOpen size={24} />}<strong>{value === 'onsite' ? 'Onsite at campus' : 'Live online'}</strong><small>{value === 'onsite' ? 'Reserved classroom seat' : 'No seat limit · pay per lesson'}</small></button>)}</section> : null}
      {step === 2 ? <>
        <div className="booking-selection-summary"><CalendarDays size={22} /><div><strong>{allSessions.length ? `${day(String(allSessions[0].starts_at))} - ${day(String(allSessions.at(-1)!.starts_at))}` : 'No upcoming lessons'}</strong><small>{allSessions.length} upcoming lessons</small></div></div>
        {sessionId ? <label className="enrolment-follow"><input type="checkbox" checked={scope === 'full'} onChange={event => { setScope(event.target.checked ? 'full' : 'lesson'); setPayMonthly(false); }} />Also reserve the following lessons in this course</label> : <div className="student-timetable-switch enrolment-scope" role="group" aria-label="Course length"><button type="button" className={scope === 'full' ? 'active' : ''} onClick={() => setScope('full')}>Full course</button><button type="button" className={scope === 'month' ? 'active' : ''} onClick={() => { setScope('month'); setPayMonthly(false); }}>This month only</button></div>}
        {quote ? <div className="enrolment-period"><strong>{quote.required} lessons · {quote.months} {quote.months === 1 ? 'month' : 'months'}</strong><span>{day(quote.from)} - {day(quote.until)}</span></div> : null}
        <section className="booking-payment-options" aria-label="Payment choice">
          {(balances.onsite.available > 0 || balances.online.available > 0 || funding === 'balance') ? <button type="button" className={funding === 'balance' ? 'selected' : ''} aria-pressed={funding === 'balance'} onClick={() => chooseFunding('balance')}><CreditCard size={21} /><strong>Use my pass</strong><div className="booking-credit-balances"><span><Building2 size={16} /><b>{balances.onsite.available}</b> onsite</span><span><BookOpen size={16} /><b>{balances.online.available}</b> online</span></div><small>{balances[mode].covered} of {dates.length} lessons covered for these dates</small></button> : null}
          {funding === 'balance' && quote && quote.missing > 0 ? <div className="enrolment-shortfall"><strong>{quote.missing} more {mode} credits needed</strong><p>Choose a top-up or pay for the remaining lessons.</p></div> : null}
          {mode === 'onsite' && !sessionId || mode === 'onsite' && scope === 'full' ? <button type="button" className={funding === 'package' ? 'selected' : ''} aria-pressed={funding === 'package'} onClick={() => chooseFunding('package')}><School size={21} /><strong>{scope === 'month' ? 'Book this month' : 'Course + learning pass'}</strong><p>{scope === 'month' ? `${quote?.required || 0} remaining lessons × ${quote ? money(quote.unitPrice) : '-'}` : `${money(Number(quote?.product.price || 0))} per month`}</p><small>Includes {Number(quote?.product.online_credits || 0)} online + {Number(quote?.product.study_credits || 0)} study visits per paid month</small></button> : null}
          {mode === 'onsite' && cards.length > 0 && quote?.missing ? <button type="button" className={funding === 'topup' ? 'selected' : ''} aria-pressed={funding === 'topup'} onClick={() => chooseFunding('topup')}><Plus size={21} /><strong>Top up my pass</strong><small>{Number(quote.product.onsite_credits)} onsite + {Number(quote.product.online_credits)} online + {Number(quote.product.study_credits)} study per pass</small></button> : null}
          <button type="button" className={funding === 'direct' || mode === 'online' && funding === 'package' ? 'selected' : ''} aria-pressed={funding === 'direct' || mode === 'online' && funding === 'package'} onClick={() => chooseFunding('direct')}><BookOpen size={21} /><strong>{mode === 'online' ? 'Online lessons only' : 'Lessons only'}</strong><p>{quote ? money(quote.unitPrice) : '-'} per lesson</p><small>Existing valid credits are used first. No bonus credits.</small></button>
        </section>
      </> : null}
      {quote && step > 1 && !(funding === 'balance' && quote.missing) ? <>
        {scope === 'full' && quote.total > 0 ? <div className="student-timetable-switch enrolment-payment" role="group" aria-label="Payment schedule"><button type="button" className={!payMonthly ? 'active' : ''} onClick={() => setPayMonthly(false)}>Pay in full</button><button type="button" className={payMonthly ? 'active' : ''} onClick={() => setPayMonthly(true)}>Pay monthly</button></div> : null}
        {quote.extra > 0 ? <section className="pass-extra-choice"><strong>{quote.extra} extra onsite {quote.extra === 1 ? 'lesson' : 'lessons'}</strong><label><input type="checkbox" checked={includeExtra} onChange={event => setIncludeExtra(event.target.checked)} />Add extra credits · {money(quote.unitPrice)} each</label><small>{includeExtra ? 'Included in the total below.' : 'Your seats stay reserved. Extra lessons require a valid onsite credit before attending.'}</small></section> : null}
        <div className="pass-checkout-summary"><div><span>{payMonthly ? 'FIRST PAYMENT' : 'TOTAL'}</span><strong>{money(quote.dueNow)}</strong></div><p>{quote.covered} existing credits · {quote.required} lessons reserved{scope === 'month' ? ' this month' : ''}</p>{payMonthly ? <p>Course total {money(quote.total)} · monthly bills due by the 7th</p> : null}</div>
        {step === 3 ? <><div className="table-scroll"><table className="data-table"><thead><tr><th>Month</th><th>Lessons</th><th>From my pass</th><th>Amount</th><th>Pay by</th></tr></thead><tbody>{quote.periods.map(period => <tr key={period.month}><td>{period.month}</td><td>{period.lessons}</td><td>{period.covered}</td><td>{money(period.price)}</td><td>{day(period.dueAt)}</td></tr>)}</tbody></table></div><div className="enrolment-bonus">Plan includes {quote.periods.reduce((sum, period) => sum + period.credits.online, 0)} online credits · {quote.periods.reduce((sum, period) => sum + period.credits.study, 0)} study visits. {payMonthly ? 'Issued month by month when each payment is confirmed.' : 'Issued when payment is confirmed.'}</div><p className="enrolment-payment-note">{quote.total ? 'Pay at campus. Unconfirmed payments are highlighted on your course.' : 'No payment needed. Confirm to reserve your existing credits.'}</p></> : null}
      </> : null}</>}
    </main><footer>{done ? <button type="button" className="primary-button" onClick={onClose}>Done <Check size={17} /></button> : <><button type="button" className="quiet-button" disabled={busy} onClick={() => step > 1 ? setStep(step - 1) : onClose()}><ChevronLeft size={16} />Back</button><button type="button" className="primary-button" disabled={busy || !quote || step > 1 && funding === 'balance' && quote.missing > 0} onClick={() => step < 3 ? setStep(step + 1) : void confirm()}>{busy ? 'Saving...' : step === 3 ? quote?.total ? 'Reserve & pay at campus' : 'Confirm booking' : 'Continue'}<ChevronRight size={16} /></button></>}</footer>
  </section></div>;
}
