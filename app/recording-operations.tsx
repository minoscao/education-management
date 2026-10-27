"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { BusinessRow as Row } from "./lib/business-workflow";
import { useDialogFocus } from "./lib/use-dialog-focus";
import "./recording-operations.css";

export type RecordingOperationsData = {
  rules: {
    monthlyDueDay: number | null;
    firstMonthManual: boolean;
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    walletInstructions?: string;
    unitPrices?: { onsite: number; online: number; study: number };
  };
  orders: Row[];
  holds: Row[];
  firstMonthPlans: Row[];
  firstMonthRequired?: string[];
  makeups: Row[];
  cancelledBookings?: Row[];
  events: Row[];
};

export const emptyRecordingOperations: RecordingOperationsData = {
  rules: {
    monthlyDueDay: null,
    firstMonthManual: true,
    unitPrices: { onsite: 20, online: 10, study: 10 },
  },
  orders: [],
  holds: [],
  firstMonthPlans: [],
  firstMonthRequired: [],
  makeups: [],
  events: [],
};

type Run = (action: string, values?: Row) => Promise<boolean>;
type Data = {
  operations?: RecordingOperationsData;
  students: Row[];
  runs: Row[];
  sessions: Row[];
  bookings: Row[];
};
type FormProps = { busy: boolean; run: Run };
const val = (row: Row | undefined | null, key: string) =>
  String(row?.[key] ?? "");
const words = (value: unknown) =>
  String(value || "Pending").replaceAll("_", " ");
const actionLabels: Record<string, string> = {
  saveOperatingRules: "Payment settings updated",
  createManualCoursePlan: "First month arranged",
  adjustCourseOrder: "Course bill adjusted",
  confirmCoursePayment: "Payment confirmed",
  extendCourseHold: "Payment deadline extended",
  releaseCourseHold: "Unpaid reservations released",
  releaseOverdueHolds: "Overdue reservations checked",
  scheduleCampusMakeup: "Replacement lesson arranged",
  convertLessonMode: "Lesson mode changed",
};
const money = (value: unknown) =>
  `RM ${Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amount = (order: Row) =>
  order.amount_cents == null
    ? Number(order.total_amount || 0)
    : Number(order.amount_cents) / 100;
const originalAmount = (order: Row) =>
  order.original_amount_cents == null
    ? amount(order)
    : Number(order.original_amount_cents) / 100;
const balance = (order: Row) =>
  Math.max(0, amount(order) - Number(order.paid_amount || 0));
const unpaid = (order: Row) =>
  !["paid", "cancelled", "refunded", "void"].includes(val(order, "status"));
const localNow = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};
const dateLabel = (value: unknown, includeTime = false) => {
  if (!value) return "Not set";
  const input = String(value);
  // Timetable and payment fields use campus-local dates. Keep their calendar date.
  let iso = input.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += "T12:00:00+08:00";
  else if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += "+08:00";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : {}),
  });
};
const monthLabel = (value: unknown) => {
  const month = String(value || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return "Month not assigned";
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
};
const orderMonth = (order: Row) =>
  val(order, "billing_month") || val(order, "service_month");
const learnerName = (row: Row, students: Row[]) =>
  val(row, "student_name") ||
  val(
    students.find((student) => student.id === row.student_id),
    "name",
  ) ||
  "Student";
const runLabel = (run: Row | undefined) =>
  [val(run, "course_title"), val(run, "name") || val(run, "run_name")]
    .filter(Boolean)
    .join(" · ") || "Course package";
const orderLabel = (order: Row, runs: Row[]) =>
  val(order, "course_title") ||
  val(order, "product_name") ||
  runLabel(runs.find((run) => run.id === order.selected_run_id));
const sessionLabel = (session: Row) =>
  `${val(session, "course_title") || val(session, "topic") || "Lesson"} · ${dateLabel(session.starts_at, true)}${val(session, "classroom_name") ? ` · ${val(session, "classroom_name")}` : ""}`;
const futureSession = (session: Row) =>
  val(session, "starts_at").replace(" ", "T").slice(0, 16) > localNow();
const formValues = (event: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(event.currentTarget));

function useOperation(run: Run, busy: boolean) {
  const requestKey = useRef("");
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(action: string, values: Row, success: string) {
    if (inFlight.current || busy) return false;
    inFlight.current = true;
    setPending(true);
    setError("");
    setNotice("");
    requestKey.current ||= crypto.randomUUID();
    try {
      const ok = await run(action, {
        ...values,
        requestKey: requestKey.current,
      });
      if (!ok) {
        setError(
          "This change was not saved. Check the message above, correct the details and try again.",
        );
        return false;
      }
      requestKey.current = "";
      setNotice(success);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save. Please try again.",
      );
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return { submit, disabled: busy || pending, pending, error, notice };
}

function Feedback({
  operation,
}: {
  operation: ReturnType<typeof useOperation>;
}) {
  return (
    <>
      {operation.error ? (
        <p role="alert" className="workflow-error">
          {operation.error}
        </p>
      ) : null}
      {operation.notice ? (
        <p role="status" className="workflow-notice">
          {operation.notice}
        </p>
      ) : null}
    </>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function Badge({ value }: { value: unknown }) {
  const state = String(value || "pending");
  return (
    <span
      className={`recording-badge recording-badge-${state.replace(/[^a-z_]/g, "")}`}
    >
      {words(value)}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="recording-empty">{children}</p>;
}

export function RecordingOperationsWorkspace({
  data,
  admin,
  studentId,
  busy,
  run,
}: {
  data: Data;
  admin: boolean;
  studentId: string;
  busy: boolean;
  run: Run;
}) {
  const [tab, setTab] = useState("billing");
  const [studentFilter, setStudentFilter] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [document, setDocument] = useState<Row | null>(null);
  const operations = data.operations || emptyRecordingOperations;
  const selectedStudent = admin ? studentFilter : studentId;
  const isVisible = (row: Row) =>
    admin
      ? !selectedStudent || row.student_id === selectedStudent
      : !!studentId && row.student_id === studentId;
  const ownOrders = operations.orders.filter(isVisible);
  const orders = ownOrders.filter(
    (order) =>
      orderFilter === "all" ||
      (orderFilter === "unpaid" ? unpaid(order) : order.status === "paid"),
  );
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) || orders[0];
  const holds = operations.holds.filter(isVisible);
  const plans = operations.firstMonthPlans.filter(isVisible);
  const makeups = operations.makeups.filter(isVisible);
  const outstanding = ownOrders
    .filter(unpaid)
    .reduce((sum, order) => sum + balance(order), 0);
  const held = holds.filter((hold) => hold.status === "held").length;
  const pendingPlans = plans.filter(
    (plan) =>
      !["completed", "paid", "approved", "cancelled"].includes(
        val(plan, "status"),
      ),
  );
  const requiredPlans = (
    operations.rules.firstMonthManual ? operations.firstMonthRequired || [] : []
  ).filter((id) =>
    admin
      ? !selectedStudent || id === selectedStudent
      : !!studentId && id === studentId,
  );
  return (
    <section
      className="workflow-workspace recording-operations"
      aria-busy={busy}
    >
      <div className="workflow-heading">
        <div>
          <h2>
            {admin
              ? "Course billing & lesson support"
              : "My bills & reserved lessons"}
          </h2>
          <p>
            {admin
              ? "Set first-month arrangements, confirm received payments and manage lesson exceptions."
              : "View your monthly bills, payment details, reserved seats and replacement lessons."}
          </p>
        </div>
        {admin && tab === "billing" ? (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => setShowPlan(!showPlan)}
          >
            {showPlan ? "Close first-month form" : "Arrange first month"}
          </button>
        ) : null}
      </div>
      {admin ? (
        <div className="recording-toolbar">
          <Field label="Student">
            <select
              value={studentFilter}
              disabled={busy}
              onChange={(event) => {
                setStudentFilter(event.target.value);
                setSelectedOrderId("");
              }}
            >
              <option value="">All students</option>
              {data.students.map((student) => (
                <option key={val(student, "id")} value={val(student, "id")}>
                  {val(student, "name")} · {val(student, "code")}
                </option>
              ))}
            </select>
          </Field>
          <p className="workflow-muted">
            All dates and payment records use campus time in Malaysia.
          </p>
        </div>
      ) : null}
      <div className="recording-summary">
        <div>
          <span>Outstanding</span>
          <strong>{money(outstanding)}</strong>
        </div>
        <div>
          <span>Lessons awaiting payment</span>
          <strong>{held}</strong>
        </div>
        <div>
          <span>First months awaiting review</span>
          <strong>
            {
              new Set([
                ...pendingPlans.map((plan) => val(plan, "student_id")),
                ...requiredPlans,
              ]).size
            }
          </strong>
        </div>
      </div>
      <nav className="workflow-tabs" aria-label="Course billing and support">
        {[
          ["billing", "Bills & receipts"],
          ["seats", "Reserved lessons"],
          ["lessons", admin ? "Lesson changes" : "Replacement lessons"],
          ...(admin
            ? [
                ["settings", "Payment settings"],
                ["history", "Activity history"],
              ]
            : []),
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={tab === id}
            disabled={busy}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {!data.operations && busy ? (
        <p role="status">Loading bills and lesson arrangements…</p>
      ) : (
        <>
          {tab === "billing" ? (
            <>
              {admin && showPlan ? (
                <ManualPlan
                  key={selectedStudent || "new"}
                  data={data}
                  defaultStudentId={selectedStudent}
                  rules={operations.rules}
                  busy={busy}
                  run={run}
                  onCreated={() => setShowPlan(false)}
                />
              ) : null}
              {pendingPlans.length ? (
                <div className="workflow-alert">
                  <h3>
                    {admin
                      ? "First month needs campus review"
                      : "Your first month is being arranged"}
                  </h3>
                  <p>
                    {admin
                      ? "Review the agreed course fee, ticket allowance and deadline before confirming payment."
                      : "The campus will confirm your first-month price and ticket allowance. Your monthly bill will appear here when it is ready."}
                  </p>
                  {pendingPlans.map((plan, index) => (
                    <p
                      key={`${val(plan, "student_id")}-${val(plan, "service_month")}-${index}`}
                    >
                      {admin ? `${learnerName(plan, data.students)} · ` : ""}
                      {monthLabel(plan.service_month)} · {words(plan.status)}
                      {plan.note ? ` — ${val(plan, "note")}` : ""}
                    </p>
                  ))}
                </div>
              ) : null}
              {requiredPlans.length ? (
                <div className="workflow-alert">
                  <h3>
                    {admin
                      ? "First-month arrangements required"
                      : "Waiting for your first-month arrangement"}
                  </h3>
                  <p>
                    {admin
                      ? "These students need an agreed first-month fee and ticket allowance. Use Arrange first month to create their plans."
                      : "The campus is preparing your first-month fee and ticket allowance. Contact the campus to confirm your course, start month and any trial arrangement."}
                  </p>
                  {admin ? (
                    <p>
                      {requiredPlans
                        .map(
                          (id) =>
                            val(
                              data.students.find(
                                (student) => student.id === id,
                              ),
                              "name",
                            ) || id,
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {!admin ? <PaymentInstructions rules={operations.rules} /> : null}
              <div className="recording-toolbar">
                <Field label="Show bills">
                  <select
                    value={orderFilter}
                    onChange={(event) => setOrderFilter(event.target.value)}
                  >
                    <option value="all">All bills</option>
                    <option value="unpaid">Awaiting payment</option>
                    <option value="paid">Paid / waived</option>
                  </select>
                </Field>
              </div>
              {orders.length ? (
                <div className="recording-billing-grid">
                  <div
                    className="workflow-card recording-order-list"
                    aria-label="Course bills"
                  >
                    {orders.map((order) => (
                      <button
                        type="button"
                        key={val(order, "id")}
                        className={
                          order.id === selectedOrder?.id ? "active" : ""
                        }
                        aria-pressed={order.id === selectedOrder?.id}
                        disabled={busy}
                        onClick={() => setSelectedOrderId(val(order, "id"))}
                      >
                        <span className="recording-list-top">
                          <strong>{money(amount(order))}</strong>
                          <Badge value={order.status} />
                        </span>
                        {admin ? (
                          <strong>{learnerName(order, data.students)}</strong>
                        ) : null}
                        <span>{orderLabel(order, data.runs)}</span>
                        <span>{monthLabel(orderMonth(order))}</span>
                        <small>
                          {order.due_at
                            ? `Due ${dateLabel(order.due_at)}`
                            : "Deadline awaiting campus confirmation"}
                        </small>
                      </button>
                    ))}
                  </div>
                  {selectedOrder ? (
                    <div className="workflow-card">
                      <OrderDetails
                        order={selectedOrder}
                        data={data}
                        holds={holds}
                        onDocument={() => setDocument(selectedOrder)}
                      />
                      {admin && unpaid(selectedOrder) ? (
                        <>
                          <AdjustOrder
                            key={`adjust-${val(selectedOrder, "id")}-${val(selectedOrder, "amount_cents")}-${val(selectedOrder, "total_amount")}-${val(selectedOrder, "due_at")}`}
                            order={selectedOrder}
                            busy={busy}
                            run={run}
                          />
                          <ReceivePayment
                            key={`pay-${val(selectedOrder, "id")}-${amount(selectedOrder)}`}
                            order={selectedOrder}
                            busy={busy}
                            run={run}
                          />
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <Empty>
                  {orderFilter === "all"
                    ? "No course bills yet. A bill appears after course selection or a campus first-month arrangement."
                    : "No bills match this filter."}
                </Empty>
              )}
            </>
          ) : null}
          {tab === "seats" ? (
            <>
              <div className="workflow-notice">
                Your course can reserve lessons in later months. Each month has
                its own bill. Unpaid reservations may be released after that
                bill’s deadline; contact the campus before the deadline if you
                need more time.
              </div>
              {admin ? <ReleaseOverdue busy={busy} run={run} /> : null}
              {holds.length ? (
                <div className="recording-hold-groups">
                  {Array.from(
                    new Set(holds.map((hold) => val(hold, "order_id"))),
                  ).map((orderId) => {
                    const order = operations.orders.find(
                      (item) => item.id === orderId,
                    );
                    const group = holds.filter(
                      (hold) => hold.order_id === orderId,
                    );
                    return (
                      <div className="workflow-card" key={orderId}>
                        <div className="recording-section-heading">
                          <div>
                            <h3>
                              {order
                                ? orderLabel(order, data.runs)
                                : "Reserved lessons"}
                            </h3>
                            <p>
                              {learnerName(group[0], data.students)}
                              {order
                                ? ` · ${monthLabel(orderMonth(order))}`
                                : ""}
                            </p>
                          </div>
                          {order ? <Badge value={order.status} /> : null}
                        </div>
                        <div className="recording-lesson-list">
                          {group.map((hold) => (
                            <article key={val(hold, "id")}>
                              <div>
                                <strong>
                                  {val(hold, "topic") || "Lesson"}
                                </strong>
                                <span>{dateLabel(hold.starts_at, true)}</span>
                                <small>
                                  {hold.status === "held"
                                    ? hold.deadline
                                      ? `Payment deadline: ${dateLabel(hold.deadline)}`
                                      : "Deadline awaiting campus confirmation"
                                    : hold.status === "released"
                                      ? val(hold, "release_reason") ||
                                        "Reservation released"
                                      : "Payment confirmed"}
                                </small>
                              </div>
                              <Badge value={hold.status} />
                            </article>
                          ))}
                        </div>
                        {admin &&
                        order &&
                        group.some((hold) => hold.status === "held") ? (
                          <HoldActions
                            key={`${orderId}-${val(order, "due_at")}`}
                            order={order}
                            busy={busy}
                            run={run}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty>No reserved lessons to show.</Empty>
              )}
            </>
          ) : null}
          {tab === "lessons" ? (
            <>
              {admin ? (
                <div className="recording-two-columns">
                  <MakeupForm
                    data={data}
                    operations={operations}
                    busy={busy}
                    run={run}
                  />
                  <ModeChangeForm
                    data={data}
                    selectedStudent={selectedStudent}
                    busy={busy}
                    run={run}
                  />
                </div>
              ) : null}
              <div className="workflow-card">
                <h3>Replacement lesson records</h3>
                {makeups.length ? (
                  <div className="recording-lesson-list">
                    {makeups.map((makeup, index) => {
                      const original = data.sessions.find(
                        (session) => session.id === makeup.original_session_id,
                      );
                      const target = data.sessions.find(
                        (session) => session.id === makeup.target_session_id,
                      );
                      return (
                        <article key={val(makeup, "id") || `${index}`}>
                          <div>
                            {admin ? (
                              <strong>
                                {learnerName(makeup, data.students)}
                              </strong>
                            ) : null}
                            <span>
                              Original:{" "}
                              {original
                                ? sessionLabel(original)
                                : val(makeup, "original_session_id")}
                            </span>
                            <strong>
                              Replacement:{" "}
                              {target
                                ? sessionLabel(target)
                                : val(makeup, "target_session_id")}
                            </strong>
                            <small>
                              {val(makeup, "reason") || val(makeup, "note")}
                            </small>
                          </div>
                          <Badge value="arranged" />
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <Empty>
                    No campus replacement lessons have been arranged.
                  </Empty>
                )}
              </div>
            </>
          ) : null}
          {admin && tab === "settings" ? (
            <PaymentSettings
              key={JSON.stringify(operations.rules)}
              rules={operations.rules}
              busy={busy}
              run={run}
            />
          ) : null}
          {admin && tab === "history" ? (
            <div className="workflow-card">
              <h3>Campus operation history · all students</h3>
              {operations.events.length ? (
                <div className="recording-lesson-list">
                  {operations.events.map((event, index) => (
                    <article key={val(event, "id") || `${index}`}>
                      <div>
                        <strong>
                          {actionLabels[val(event, "action")] ||
                            words(
                              event.action || event.event_type || event.kind,
                            )}
                        </strong>
                        <span>
                          {val(event, "note") ||
                            val(event, "reason") ||
                            val(event, "description") ||
                            "Operation recorded"}
                        </span>
                        <small>
                          {val(event, "student_name")}{" "}
                          {val(event, "actor_name") ||
                            val(event, "created_by") ||
                            val(event, "actor_id")}
                        </small>
                      </div>
                      <time>
                        {dateLabel(
                          event.created_at
                            ? `${val(event, "created_at").replace(" ", "T")}Z`
                            : "",
                          true,
                        )}
                      </time>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty>Saved changes will appear here.</Empty>
              )}
            </div>
          ) : null}
        </>
      )}
      {document ? (
        <CourseDocument
          order={document}
          data={data}
          rules={operations.rules}
          onClose={() => setDocument(null)}
        />
      ) : null}
    </section>
  );
}

function OrderDetails({
  order,
  data,
  holds,
  onDocument,
}: {
  order: Row;
  data: Data;
  holds: Row[];
  onDocument: () => void;
}) {
  const ownHolds = holds.filter((hold) => hold.order_id === order.id);
  return (
    <>
      <div className="recording-section-heading">
        <div>
          <h3>{orderLabel(order, data.runs)}</h3>
          <p>
            {learnerName(order, data.students)} ·{" "}
            {monthLabel(orderMonth(order))}
          </p>
        </div>
        <Badge value={order.status} />
      </div>
      <dl className="workflow-details">
        <div>
          <dt>Original amount</dt>
          <dd>{money(originalAmount(order))}</dd>
        </div>
        <div>
          <dt>Agreed amount</dt>
          <dd>
            <strong>{money(amount(order))}</strong>
          </dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd>{money(order.paid_amount)}</dd>
        </div>
        <div>
          <dt>Amount outstanding</dt>
          <dd>{money(balance(order))}</dd>
        </div>
        <div>
          <dt>Payment deadline</dt>
          <dd>
            {order.due_at
              ? dateLabel(order.due_at)
              : "Awaiting campus confirmation"}
          </dd>
        </div>
        <div>
          <dt>Ticket period</dt>
          <dd>
            {orderMonth(order)
              ? `${monthLabel(orderMonth(order))} only`
              : "See package details"}
          </dd>
        </div>
        <div>
          <dt>Attendance mode</dt>
          <dd>{words(order.delivery_mode)}</dd>
        </div>
        <div>
          <dt>Reserved lessons</dt>
          <dd>
            {ownHolds.filter((hold) => hold.status === "held").length} awaiting
            payment ·{" "}
            {ownHolds.filter((hold) => hold.status === "confirmed").length}{" "}
            confirmed ·{" "}
            {ownHolds.filter((hold) => hold.status === "released").length}{" "}
            released
          </dd>
        </div>
      </dl>
      {order.adjustment_reason || order.note ? (
        <p className="recording-note">
          Campus arrangement:{" "}
          {val(order, "adjustment_reason") || val(order, "note")}
        </p>
      ) : null}
      {Number(order.manual_review) === 1 ? (
        <p className="workflow-alert">
          This bill is waiting for campus review. The final amount and ticket
          allowance must be confirmed before payment.
        </p>
      ) : null}
      <button type="button" className="quiet-button" onClick={onDocument}>
        {order.status === "paid"
          ? "View receipt / confirmation"
          : "View invoice"}
      </button>
    </>
  );
}

function ManualPlan({
  data,
  defaultStudentId,
  rules,
  busy,
  run,
  onCreated,
}: FormProps & {
  data: Data;
  defaultStudentId: string;
  rules: RecordingOperationsData["rules"];
  onCreated: () => void;
}) {
  const operation = useOperation(run, busy);
  const [studentId, setStudentId] = useState(defaultStudentId);
  const [runId, setRunId] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"onsite" | "online">(
    "onsite",
  );
  const [serviceMonth, setServiceMonth] = useState(localNow().slice(0, 7));
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [reserveFuture, setReserveFuture] = useState(true);
  const [includeExtra, setIncludeExtra] = useState(false);
  const [credits, setCredits] = useState({
    onsite: "4",
    online: "6",
    study: "2",
  });
  const [overrideAmount, setOverrideAmount] = useState<string | null>(null);
  const prices = rules.unitPrices || { onsite: 20, online: 10, study: 10 };
  const creditKinds = ["onsite", "online", "study"] as const;
  const suggestedCents = creditKinds.reduce(
    (sum, kind) =>
      sum + Number(credits[kind] || 0) * Math.round(prices[kind] * 100),
    0,
  );
  const suggested = suggestedCents / 100;
  const agreedAmount = overrideAmount ?? suggested.toFixed(2);
  const adjustment =
    Math.round(Number(agreedAmount || 0) * 100) - suggestedCents;
  const runs = data.runs.filter((row) => row.status === "open");
  function lessonsFor(selectedRun: string, month: string) {
    return data.sessions.filter(
      (session) =>
        session.class_run_id === selectedRun &&
        val(session, "starts_at").slice(0, 7) === month &&
        session.status === "scheduled" &&
        futureSession(session),
    );
  }
  const firstLessons = lessonsFor(runId, serviceMonth);
  const selectedIds = selectedSessions.filter((id) =>
    firstLessons.some((session) => session.id === id),
  );
  const allowedLessons = Number(credits[deliveryMode] || 0);
  const overQuota = selectedIds.length > allowedLessons;
  const totalCredits = creditKinds.reduce(
    (sum, kind) => sum + Number(credits[kind] || 0),
    0,
  );
  const futureCounts = new Map<string, number>();
  for (const session of data.sessions) {
    const month = val(session, "starts_at").slice(0, 7);
    if (
      session.class_run_id === runId &&
      month > serviceMonth &&
      session.status === "scheduled" &&
      futureSession(session)
    )
      futureCounts.set(month, (futureCounts.get(month) || 0) + 1);
  }
  const futureMonths = [...futureCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, count]) => ({
      month,
      count,
      extra: Math.max(0, count - (deliveryMode === "onsite" ? 4 : 6)),
    }));
  const extraConsentNeeded =
    reserveFuture &&
    !includeExtra &&
    futureMonths.some((month) => month.extra > 0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!totalCredits || overQuota || extraConsentNeeded) return;
    const values = formValues(event);
    const ok = await operation.submit(
      "createManualCoursePlan",
      {
        ...values,
        studentId,
        runId,
        deliveryMode,
        serviceMonth,
        sessionIds: selectedIds,
        reserveFuture,
        includeExtra,
      },
      "First-month arrangement saved. Review the bill below, then confirm the payment or fee waiver.",
    );
    if (ok) onCreated();
  }
  return (
    <form className="workflow-card" onSubmit={submit}>
      <h3>Arrange a first month or trial</h3>
      <p>
        Set the three ticket quantities for the first calendar month. The
        suggested fee updates from the campus unit prices; you can agree a
        different final fee or a free month. Payment is confirmed separately
        after saving this plan.
      </p>
      <fieldset disabled={operation.disabled}>
        <div className="workflow-form-grid">
          <Field label="Student">
            <select
              required
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">Choose a student</option>
              {data.students.map((student) => (
                <option key={val(student, "id")} value={val(student, "id")}>
                  {val(student, "name")} · {val(student, "code")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Course / class">
            <select
              name="runId"
              required
              value={runId}
              onChange={(event) => {
                setRunId(event.target.value);
                setSelectedSessions(
                  lessonsFor(event.target.value, serviceMonth).map((session) =>
                    val(session, "id"),
                  ),
                );
              }}
            >
              <option value="">Choose a course class</option>
              {runs.map((row) => (
                <option key={val(row, "id")} value={val(row, "id")}>
                  {runLabel(row)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Attendance mode">
            <select
              name="deliveryMode"
              required
              value={deliveryMode}
              onChange={(event) =>
                setDeliveryMode(event.target.value as "onsite" | "online")
              }
            >
              <option value="onsite">Onsite</option>
              <option value="online">Online</option>
            </select>
          </Field>
          <Field
            label="First service month"
            hint="Tickets belong to this calendar month; a late start does not extend them into the next month."
          >
            <input
              type="month"
              name="serviceMonth"
              required
              min={localNow().slice(0, 7)}
              value={serviceMonth}
              onChange={(event) => {
                setServiceMonth(event.target.value);
                setSelectedSessions(
                  lessonsFor(runId, event.target.value).map((session) =>
                    val(session, "id"),
                  ),
                );
              }}
            />
          </Field>
          <Field
            label="Payment deadline"
            hint={`Leave blank to await a campus deadline; no overdue release applies until a date is set.${rules.monthlyDueDay ? ` Later months use the configured day ${rules.monthlyDueDay}.` : ""}`}
          >
            <input type="date" name="dueAt" />
          </Field>
        </div>
        <div className="recording-credit-fields">
          <Field label="Onsite tickets">
            <input
              type="number"
              name="onsiteCredits"
              min="0"
              max="100"
              step="1"
              required
              value={credits.onsite}
              onChange={(event) =>
                setCredits({ ...credits, onsite: event.target.value })
              }
            />
          </Field>
          <Field label="Online tickets">
            <input
              type="number"
              name="onlineCredits"
              min="0"
              max="100"
              step="1"
              required
              value={credits.online}
              onChange={(event) =>
                setCredits({ ...credits, online: event.target.value })
              }
            />
          </Field>
          <Field label="Study tickets">
            <input
              type="number"
              name="studyCredits"
              min="0"
              max="100"
              step="1"
              required
              value={credits.study}
              onChange={(event) =>
                setCredits({ ...credits, study: event.target.value })
              }
            />
          </Field>
        </div>
        <div className="recording-learner-picker">
          <h4>First-month lessons</h4>
          <p className="workflow-muted">
            Choose the specific lessons included in this arrangement, or leave
            all lessons unselected to issue tickets without a first-month
            reservation.
          </p>
          {runId ? (
            firstLessons.length ? (
              <>
                <p>
                  {selectedIds.length} selected · {allowedLessons}{" "}
                  {deliveryMode} tickets available in this plan
                </p>
                <div className="workflow-actions">
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={firstLessons.length > allowedLessons}
                    onClick={() =>
                      setSelectedSessions(
                        firstLessons.map((session) => val(session, "id")),
                      )
                    }
                  >
                    Select all this month
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => setSelectedSessions([])}
                  >
                    Clear selection
                  </button>
                </div>
                {firstLessons.map((session) => (
                  <label className="recording-check" key={val(session, "id")}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(val(session, "id"))}
                      onChange={(event) =>
                        setSelectedSessions(
                          event.target.checked
                            ? [...selectedIds, val(session, "id")]
                            : selectedIds.filter((id) => id !== session.id),
                        )
                      }
                    />
                    <span>
                      {dateLabel(session.starts_at, true)} ·{" "}
                      {val(session, "topic") || "Lesson"}
                      {session.classroom_name
                        ? ` · ${val(session, "classroom_name")}`
                        : ""}
                    </span>
                  </label>
                ))}
                {overQuota ? (
                  <p role="alert" className="workflow-error">
                    Select at most {allowedLessons} {deliveryMode} lessons, or
                    increase the corresponding ticket quantity.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="workflow-muted">
                No future lessons are scheduled for this course in{" "}
                {monthLabel(serviceMonth)}. You can issue the agreed tickets
                without reserving a first-month lesson.
              </p>
            )
          ) : (
            <p className="workflow-muted">
              Choose a course to see its first-month lessons.
            </p>
          )}
          {runId && selectedIds.length === 0 ? (
            <p className="workflow-notice">
              No first-month lessons will be reserved. The agreed tickets are
              issued after payment or an approved fee waiver.
            </p>
          ) : null}
        </div>
        <div className="recording-future-plan">
          <h4>Later months</h4>
          <label className="recording-check">
            <input
              type="checkbox"
              checked={reserveFuture}
              onChange={(event) => setReserveFuture(event.target.checked)}
            />
            <span>
              Reserve the remaining course lessons in later months, with a
              separate bill for each month.
            </span>
          </label>
          {reserveFuture && futureMonths.length ? (
            <>
              <div className="recording-price-preview">
                <h4>Future monthly bill estimate</h4>
                <dl>
                  {futureMonths.map((month) => (
                    <div key={month.month}>
                      <dt>
                        {monthLabel(month.month)} · {month.count} {deliveryMode}{" "}
                        lessons
                        {month.extra ? (
                          <small>{`462 package ${money(160)} + ${month.extra} extra × ${money(prices[deliveryMode])}`}</small>
                        ) : null}
                      </dt>
                      <dd>{money(160 + month.extra * prices[deliveryMode])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {futureMonths.some((month) => month.extra > 0) ? (
                <label className="recording-check">
                  <input
                    type="checkbox"
                    checked={includeExtra}
                    onChange={(event) => setIncludeExtra(event.target.checked)}
                  />
                  <span>
                    I approve the extra lessons and charges shown above for
                    months that exceed the standard package allowance.
                  </span>
                </label>
              ) : null}
              {extraConsentNeeded ? (
                <p className="workflow-alert">
                  Approve these additional charges, or turn off later-month
                  reservations to arrange only the first month.
                </p>
              ) : null}
            </>
          ) : reserveFuture ? (
            <p className="workflow-muted">
              No later-month lessons are scheduled for this course yet.
            </p>
          ) : (
            <p className="workflow-muted">
              Only the first-month arrangement will be created. No later-month
              bills or lessons will be reserved by this action.
            </p>
          )}
        </div>
        <div className="recording-price-preview" aria-live="polite">
          <h4>First-month price calculation</h4>
          <dl>
            {creditKinds.map((kind) => (
              <div key={kind}>
                <dt>
                  {words(kind)}: {credits[kind] || "0"} × {money(prices[kind])}
                </dt>
                <dd>{money(Number(credits[kind] || 0) * prices[kind])}</dd>
              </div>
            ))}
            <div className="recording-suggested-total">
              <dt>Suggested fee</dt>
              <dd>{money(suggested)}</dd>
            </div>
          </dl>
        </div>
        <Field
          label="Final first-month fee (RM)"
          hint="This follows the suggested fee until you edit it. Enter 0 for an approved free month."
        >
          <input
            type="number"
            name="amount"
            min="0"
            max="1000000"
            step="0.01"
            required
            value={agreedAmount}
            onChange={(event) => setOverrideAmount(event.target.value)}
          />
        </Field>
        {overrideAmount !== null ? (
          <div className="recording-price-adjustment">
            <p>
              {adjustment < 0
                ? `Manual discount: ${money(-adjustment / 100)}`
                : adjustment > 0
                  ? `Additional agreed amount: ${money(adjustment / 100)}`
                  : "Final fee matches the suggested fee."}{" "}
              The final fee stays at your entered amount when quantities change.
            </p>
            <button
              type="button"
              className="quiet-button"
              onClick={() => setOverrideAmount(null)}
            >
              Use suggested fee
            </button>
          </div>
        ) : null}
        <p className="workflow-alert">
          Unused tickets expire at the end of this calendar month. They do not
          roll over or receive an automatic refund. Later full months use the
          regular monthly package: 4 onsite, 6 online and 2 study tickets,
          currently RM 160 per month.
        </p>
        <Field label="Reason / agreed arrangement">
          <textarea
            name="note"
            required
            maxLength={2000}
            placeholder="Explain the agreed first-month fee, ticket allowance and any trial or discount."
          />
        </Field>
        <button
          type="submit"
          className="primary-button"
          disabled={
            operation.disabled ||
            !runs.length ||
            totalCredits <= 0 ||
            overQuota ||
            extraConsentNeeded
          }
        >
          {operation.pending
            ? "Saving arrangement…"
            : "Create first-month arrangement"}
        </button>
        {!runs.length ? (
          <p className="workflow-muted">
            Create and publish a course class before arranging its first month.
          </p>
        ) : null}
      </fieldset>
      <Feedback operation={operation} />
    </form>
  );
}

function AdjustOrder({ order, busy, run }: FormProps & { order: Row }) {
  const operation = useOperation(run, busy);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await operation.submit(
      "adjustCourseOrder",
      { ...formValues(event), orderId: order.id },
      "Bill updated. Confirm payment separately after the money arrives, or record the approved fee waiver.",
    );
  }
  return (
    <details
      className="recording-form-section"
      open={Number(order.manual_review) === 1}
    >
      <summary>Review or adjust this bill</summary>
      <form onSubmit={submit}>
        <fieldset disabled={operation.disabled}>
          <p className="workflow-muted">
            Original amount: {money(originalAmount(order))}. A price change
            keeps its reason in the operation history.
          </p>
          <div className="workflow-form-grid">
            <Field
              label="Agreed amount (RM)"
              hint="The total cannot be below money already received. Zero requires a waiver reason."
            >
              <input
                name="amount"
                type="number"
                min={Number(order.paid_amount || 0)}
                step="0.01"
                defaultValue={amount(order).toFixed(2)}
                required
              />
            </Field>
            <Field
              label="Payment deadline"
              hint="Leave blank to await a campus deadline; this bill will not release seats automatically."
            >
              <input
                name="dueAt"
                type="date"
                defaultValue={val(order, "due_at").slice(0, 10)}
              />
            </Field>
          </div>
          <Field label="Reason for this amount / deadline">
            <textarea
              name="note"
              required
              maxLength={2000}
              placeholder="For example: approved first-month discount, trial arrangement or corrected bill."
            />
          </Field>
          <button type="submit" className="primary-button">
            {operation.pending ? "Saving bill…" : "Save agreed bill"}
          </button>
        </fieldset>
        <Feedback operation={operation} />
      </form>
    </details>
  );
}

function ReceivePayment({ order, busy, run }: FormProps & { order: Row }) {
  const operation = useOperation(run, busy);
  const waived = amount(order) === 0;
  const [method, setMethod] = useState(waived ? "fee_waiver" : "bank_transfer");
  const [receivedAmount, setReceivedAmount] = useState(
    balance(order).toFixed(2),
  );
  const mismatch =
    !waived &&
    Math.round(Number(receivedAmount) * 100) !==
      Math.round(balance(order) * 100);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mismatch) return;
    await operation.submit(
      "confirmCoursePayment",
      {
        ...formValues(event),
        orderId: order.id,
        method,
        receivedAmount: waived ? "0" : receivedAmount,
      },
      waived
        ? "Fee waiver confirmed. The confirmation is available with this bill."
        : "Payment confirmed. The receipt is available with this bill.",
    );
  }
  return (
    <form className="recording-form-section" onSubmit={submit}>
      <h4>{waived ? "Confirm the fee waiver" : "Record money received"}</h4>
      <p>
        {waived
          ? "This bill is RM 0.00. Record who approved the waiver and why before activating the arrangement."
          : "Confirm this only after checking the bank, wallet or cash record. A payment instruction or transfer screenshot alone does not confirm receipt."}
      </p>
      <fieldset disabled={operation.disabled}>
        <div className="workflow-form-grid">
          <Field label="Payment method">
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {waived ? (
                <option value="fee_waiver">Approved fee waiver</option>
              ) : (
                <>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="duitnow_qr">
                    DuitNow / electronic wallet
                  </option>
                  <option value="cash">Cash</option>
                </>
              )}
            </select>
          </Field>
          <Field
            label={
              waived ? "Waived amount due (RM)" : "Actual amount received (RM)"
            }
          >
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={receivedAmount}
              onChange={(event) => setReceivedAmount(event.target.value)}
              readOnly={waived}
            />
          </Field>
          <Field
            label={waived ? "Approval date and time" : "Received date and time"}
            hint="Malaysia campus time"
          >
            <input
              name="receivedAt"
              type="datetime-local"
              required
              defaultValue={localNow()}
              max={localNow()}
            />
          </Field>
          <Field
            label={
              waived
                ? "Approval reference"
                : "Bank / wallet transaction reference"
            }
          >
            <input
              name="reference"
              required={!waived && method !== "cash"}
              maxLength={200}
              placeholder={
                method === "cash"
                  ? "Cash collection reference (optional)"
                  : "Transaction or approval reference"
              }
            />
          </Field>
        </div>
        {mismatch ? (
          <p className="workflow-error" role="alert">
            The amount must match the outstanding {money(balance(order))}.
            Review the agreed bill before confirming a different amount.
          </p>
        ) : null}
        <Field
          label={waived ? "Waiver approval and reason" : "Collection note"}
        >
          <textarea
            name="note"
            required={waived}
            maxLength={2000}
            placeholder={
              waived
                ? "Approved by…; reason for the free month…"
                : "Optional details for this payment"
            }
          />
        </Field>
        <label className="recording-check">
          <input type="checkbox" required />{" "}
          <span>
            {waived
              ? "I confirm that this zero-fee arrangement has been approved."
              : "I have checked that the money has actually arrived and the amount, date and reference are correct."}
          </span>
        </label>
        <button
          type="submit"
          className="primary-button"
          disabled={
            operation.disabled || mismatch || Number(order.manual_review) === 1
          }
        >
          {operation.pending
            ? "Confirming…"
            : waived
              ? "Confirm approved waiver"
              : "Confirm received payment"}
        </button>
        {Number(order.manual_review) === 1 ? (
          <p className="workflow-muted">
            Save the reviewed bill above before confirming its payment.
          </p>
        ) : null}
      </fieldset>
      <Feedback operation={operation} />
    </form>
  );
}

function HoldActions({ order, busy, run }: FormProps & { order: Row }) {
  const operation = useOperation(run, busy);
  const [action, setAction] = useState("extend");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await operation.submit(
      action === "extend" ? "extendCourseHold" : "releaseCourseHold",
      { ...formValues(event), orderId: order.id },
      action === "extend"
        ? "Payment deadline extended for this bill and its held lessons."
        : "Unpaid held lessons for this bill have been released.",
    );
  }
  return (
    <details className="recording-form-section">
      <summary>Manage this month’s reservations</summary>
      <form onSubmit={submit}>
        <fieldset disabled={operation.disabled}>
          <Field label="Action">
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="extend">Extend payment deadline</option>
              <option value="release">Release unpaid reservations</option>
            </select>
          </Field>
          {action === "extend" ? (
            <Field label="New payment deadline">
              <input
                type="date"
                name="deadline"
                required
                min={localNow().slice(0, 10)}
                defaultValue={val(order, "due_at").slice(0, 10)}
              />
            </Field>
          ) : (
            <p className="workflow-alert">
              This releases the unpaid held lessons linked to this bill.
              Released onsite seats may be taken by other students. Paid
              reservations are not released by this action.
            </p>
          )}
          <Field label="Reason">
            <textarea
              name="note"
              required
              maxLength={2000}
              placeholder={
                action === "extend"
                  ? "Why has extra time been approved?"
                  : "Why should these reservations be released?"
              }
            />
          </Field>
          {action === "release" ? (
            <label className="recording-check">
              <input type="checkbox" required />
              <span>
                I have reviewed the lessons above and confirm their release.
              </span>
            </label>
          ) : null}
          <button
            className={
              action === "release" ? "recording-danger" : "primary-button"
            }
            type="submit"
          >
            {operation.pending
              ? "Saving…"
              : action === "extend"
                ? "Extend deadline"
                : "Release these reservations"}
          </button>
        </fieldset>
        <Feedback operation={operation} />
      </form>
    </details>
  );
}

function ReleaseOverdue({ busy, run }: FormProps) {
  const operation = useOperation(run, busy);
  return (
    <details className="recording-form-section">
      <summary>Release all overdue unpaid reservations</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await operation.submit(
            "releaseOverdueHolds",
            {},
            "Overdue unpaid reservations have been checked and released.",
          );
        }}
      >
        <fieldset disabled={operation.disabled}>
          <p>
            This checks all students, including those outside the current
            filter. Only unpaid reservations whose configured deadline has
            passed are released.
          </p>
          <label className="recording-check">
            <input type="checkbox" required />
            <span>
              I have reviewed overdue payments and approved extensions before
              releasing these seats.
            </span>
          </label>
          <button type="submit" className="recording-danger">
            {operation.pending
              ? "Checking overdue reservations…"
              : "Release overdue reservations"}
          </button>
        </fieldset>
        <Feedback operation={operation} />
      </form>
    </details>
  );
}

function MakeupForm({
  data,
  operations,
  busy,
  run,
}: FormProps & { data: Data; operations: RecordingOperationsData }) {
  const operation = useOperation(run, busy);
  const [originalId, setOriginalId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const original = data.sessions.find((session) => session.id === originalId);
  const originalRun = data.runs.find(
    (row) => row.id === original?.class_run_id,
  );
  const targetSessions = original
    ? data.sessions.filter((session) => {
        const runRow = data.runs.find((row) => row.id === session.class_run_id);
        return (
          session.id !== originalId &&
          session.status === "scheduled" &&
          runRow?.status === "open" &&
          futureSession(session) &&
          (session.class_run_id === original.class_run_id ||
            (!!originalRun?.course_id &&
              runRow?.course_id === originalRun.course_id))
        );
      })
    : [];
  const affected = Array.from(
    new Set(
      data.bookings
        .filter(
          (booking) =>
            booking.class_session_id === originalId &&
            (!operations.cancelledBookings ||
              operations.cancelledBookings.some(
                (cancelled) => cancelled.booking_id === booking.id,
              )),
        )
        .map((booking) => val(booking, "student_id")),
    ),
  );
  const alreadyArranged = (id: string) =>
    operations.makeups.some(
      (makeup) =>
        makeup.original_session_id === originalId && makeup.student_id === id,
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentIds.length) return;
    if (
      await operation.submit(
        "scheduleCampusMakeup",
        {
          ...formValues(event),
          originalSessionId: originalId,
          targetSessionId: targetId,
          studentIds,
        },
        "Campus replacement lessons arranged. Each selected learner receives one linked replacement lesson credit.",
      )
    )
      setStudentIds([]);
  }
  return (
    <form className="workflow-card" onSubmit={submit}>
      <h3>Campus cancellation & replacement</h3>
      <p>
        First cancel the affected lesson in the timetable. Then choose a
        published replacement for the same course. Each selected learner
        receives one lesson credit for that replacement, including an approved
        replacement in a later month.
      </p>
      <fieldset disabled={operation.disabled}>
        <Field label="Original lesson">
          <select
            required
            value={originalId}
            onChange={(event) => {
              setOriginalId(event.target.value);
              setTargetId("");
              setStudentIds([]);
            }}
          >
            <option value="">Choose a cancelled campus lesson</option>
            {data.sessions
              .filter((session) => session.status === "cancelled")
              .map((session) => (
                <option key={val(session, "id")} value={val(session, "id")}>
                  {sessionLabel(session)} · {words(session.status)}
                </option>
              ))}
          </select>
        </Field>
        {original ? (
          <p className="workflow-alert">
            The original lesson is already cancelled. Select every learner who
            should attend this replacement. Other affected learners need their
            own replacement arrangement.
          </p>
        ) : null}
        <Field label="Replacement lesson">
          <select
            required
            value={targetId}
            disabled={!originalId || operation.disabled}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">Choose a future lesson of the same course</option>
            {targetSessions.map((session) => (
              <option key={val(session, "id")} value={val(session, "id")}>
                {sessionLabel(session)} ·{" "}
                {val(session, "teacher_name") || "Teacher pending"}
              </option>
            ))}
          </select>
        </Field>
        {original && !targetSessions.length ? (
          <p className="workflow-muted">
            No suitable replacement has been scheduled. Create a future lesson
            for this course in the timetable, assign its teacher and room,
            publish its class, then return here.
          </p>
        ) : null}
        {original ? (
          <div className="recording-learner-picker">
            <strong>Affected learners</strong>
            {affected.length ? (
              affected.map((id) => (
                <label className="recording-check" key={id}>
                  <input
                    type="checkbox"
                    checked={studentIds.includes(id)}
                    disabled={operation.disabled || alreadyArranged(id)}
                    onChange={(event) =>
                      setStudentIds(
                        event.target.checked
                          ? [...studentIds, id]
                          : studentIds.filter((student) => student !== id),
                      )
                    }
                  />
                  <span>
                    {val(
                      data.students.find((student) => student.id === id),
                      "name",
                    ) || id}
                    {alreadyArranged(id)
                      ? " — replacement already arranged"
                      : ""}
                  </span>
                </label>
              ))
            ) : (
              <p className="workflow-muted">
                No learner bookings are attached to this lesson.
              </p>
            )}
          </div>
        ) : null}
        <Field label="Cancellation reason and arrangement">
          <textarea
            name="note"
            required
            maxLength={2000}
            placeholder="Why did the campus cancel this lesson, and what replacement was agreed?"
          />
        </Field>
        <button
          type="submit"
          className="primary-button"
          disabled={operation.disabled || !studentIds.length || !targetId}
        >
          {operation.pending
            ? "Arranging replacement…"
            : `Arrange replacement${studentIds.length ? ` for ${studentIds.length} learner${studentIds.length === 1 ? "" : "s"}` : ""}`}
        </button>
      </fieldset>
      <Feedback operation={operation} />
    </form>
  );
}

function ModeChangeForm({
  data,
  selectedStudent,
  busy,
  run,
}: FormProps & { data: Data; selectedStudent: string }) {
  const operation = useOperation(run, busy);
  const [bookingId, setBookingId] = useState("");
  const [policy, setPolicy] = useState("");
  const booking = data.bookings.find((row) => row.id === bookingId);
  const targetMode = booking?.delivery_mode === "online" ? "onsite" : "online";
  const eligible = data.bookings.filter((row) => {
    const session = data.sessions.find(
      (item) => item.id === row.class_session_id,
    );
    return (
      row.status === "booked" &&
      (!selectedStudent || row.student_id === selectedStudent) &&
      session?.status === "scheduled" &&
      futureSession(session)
    );
  });
  const visibleBooking = eligible.find((row) => row.id === bookingId);
  const unpaidHold = data.operations?.holds.some(
    (hold) => hold.booking_id === bookingId && hold.status === "held",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!visibleBooking || !policy || unpaidHold) return;
    if (
      await operation.submit(
        "convertLessonMode",
        {
          ...formValues(event),
          bookingId,
          deliveryMode: targetMode,
          creditPolicy: policy,
        },
        "This lesson’s attendance mode and ticket treatment have been updated.",
      )
    ) {
      setBookingId("");
      setPolicy("");
    }
  }
  return (
    <form className="workflow-card" onSubmit={submit}>
      <h3>Change one learner’s lesson mode</h3>
      <p>
        This changes one scheduled lesson. Choose the ticket treatment
        explicitly; the rest of the course keeps its existing mode.
      </p>
      <fieldset disabled={operation.disabled}>
        <Field label="Learner and booked lesson">
          <select
            required
            value={visibleBooking ? bookingId : ""}
            onChange={(event) => {
              setBookingId(event.target.value);
              setPolicy("");
            }}
          >
            <option value="">Choose a future booked lesson</option>
            {eligible.map((row) => {
              const session = data.sessions.find(
                (item) => item.id === row.class_session_id,
              );
              return (
                <option key={val(row, "id")} value={val(row, "id")}>
                  {learnerName(row, data.students)} ·{" "}
                  {session ? sessionLabel(session) : "Lesson"} ·{" "}
                  {words(row.delivery_mode)}
                </option>
              );
            })}
          </select>
        </Field>
        {!eligible.length ? (
          <p className="workflow-muted">
            There are no future booked lessons for the selected student filter.
          </p>
        ) : null}
        {visibleBooking ? (
          <p className="recording-mode-change">
            <strong>{words(booking?.delivery_mode)}</strong>
            <span>→</span>
            <strong>{words(targetMode)}</strong>
          </p>
        ) : null}
        {unpaidHold ? (
          <p className="workflow-alert">
            Confirm or reconcile this lesson’s course bill before changing its
            attendance mode.
          </p>
        ) : null}
        {visibleBooking?.payment_source === "course" ? (
          <p className="workflow-muted">
            This lesson is funded by a course payment. Keep that existing
            payment when changing its mode.
          </p>
        ) : null}
        <Field label="Ticket treatment">
          <select
            required
            value={policy}
            onChange={(event) => setPolicy(event.target.value)}
          >
            <option value="">Choose how to handle this lesson’s ticket</option>
            <option value="keep_original">
              Keep the original ticket / course payment
            </option>
            <option
              value="use_target_credit"
              disabled={visibleBooking?.payment_source === "course"}
            >
              Return the original ticket; use 1 target-mode ticket
            </option>
            <option
              value="campus_waiver"
              disabled={visibleBooking?.payment_source === "course"}
            >
              Return the original ticket; grant 1 campus replacement ticket
            </option>
          </select>
        </Field>
        {policy ? (
          <p className="workflow-notice">
            {policy === "keep_original"
              ? "Keep the existing ticket or course payment for this lesson. No extra target-mode ticket is charged."
              : policy === "use_target_credit"
                ? `Release the original unused ticket allocation and reserve exactly 1 ${targetMode} ticket. A valid target-mode ticket must be available.`
                : `Release the original unused ticket allocation. The campus grants exactly 1 ${targetMode} replacement ticket for this lesson.`}
          </p>
        ) : null}
        <Field label="Approval reason">
          <textarea
            name="note"
            required
            maxLength={2000}
            placeholder="Record the learner’s request, approval and agreed ticket treatment."
          />
        </Field>
        <button
          type="submit"
          className="primary-button"
          disabled={
            operation.disabled || !visibleBooking || !policy || unpaidHold
          }
        >
          {operation.pending
            ? "Changing lesson mode…"
            : "Save lesson mode and ticket treatment"}
        </button>
      </fieldset>
      <Feedback operation={operation} />
    </form>
  );
}

function PaymentInstructions({
  rules,
}: {
  rules: RecordingOperationsData["rules"];
}) {
  const configured =
    rules.bankName ||
    rules.bankAccountName ||
    rules.bankAccountNumber ||
    rules.walletInstructions;
  return (
    <details className="workflow-card recording-payment-instructions" open>
      <summary>How to pay</summary>
      {configured ? (
        <>
          <dl className="workflow-details">
            {rules.bankName ? (
              <div>
                <dt>Bank</dt>
                <dd>{rules.bankName}</dd>
              </div>
            ) : null}
            {rules.bankAccountName ? (
              <div>
                <dt>Account name</dt>
                <dd>{rules.bankAccountName}</dd>
              </div>
            ) : null}
            {rules.bankAccountNumber ? (
              <div>
                <dt>Account number</dt>
                <dd>{rules.bankAccountNumber}</dd>
              </div>
            ) : null}
          </dl>
          {rules.walletInstructions ? (
            <p className="recording-note">{rules.walletInstructions}</p>
          ) : null}
          <p className="workflow-muted">
            Use your student name and bill reference when paying. The campus
            will issue a receipt after confirming that the money has arrived.
          </p>
        </>
      ) : (
        <p>
          Contact the campus for bank or wallet payment details. Your receipt
          will appear after the campus confirms receipt of payment.
        </p>
      )}
    </details>
  );
}

function PaymentSettings({
  rules,
  busy,
  run,
}: FormProps & { rules: RecordingOperationsData["rules"] }) {
  const operation = useOperation(run, busy);
  const [manual, setManual] = useState(rules.firstMonthManual);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event);
    await operation.submit(
      "saveOperatingRules",
      {
        ...values,
        monthlyDueDay:
          values.monthlyDueDay === "" ? null : Number(values.monthlyDueDay),
        firstMonthManual: manual,
        unitPrices: {
          onsite: Number(values.onsiteUnitPrice),
          online: Number(values.onlineUnitPrice),
          study: Number(values.studyUnitPrice),
        },
      },
      "Payment settings saved.",
    );
  }
  return (
    <form className="workflow-card" onSubmit={submit}>
      <h3>Monthly payment settings</h3>
      <p>
        Set the campus payment deadline and the collection details shown to
        students.
      </p>
      <fieldset disabled={operation.disabled}>
        <Field
          label="Monthly payment deadline (day of month)"
          hint="Enter 1–31, or leave blank to set each bill’s deadline manually. Short months use their last day. Existing bills keep their own recorded deadlines."
        >
          <input
            name="monthlyDueDay"
            type="number"
            min="1"
            max="31"
            step="1"
            defaultValue={rules.monthlyDueDay ?? ""}
            placeholder="No default deadline"
          />
        </Field>
        <label className="recording-check">
          <input
            type="checkbox"
            checked={manual}
            onChange={(event) => setManual(event.target.checked)}
          />
          <span>
            Require campus review of first-month fees and ticket allowances
          </span>
        </label>
        <h4>First-month ticket unit prices</h4>
        <p className="workflow-muted">
          These prices calculate the suggested first-month fee. Staff can enter
          a different final fee with a reason. Later full months keep the
          regular package price.
        </p>
        <div className="recording-credit-fields">
          {(
            [
              ["onsite", "Onsite", 20],
              ["online", "Online", 10],
              ["study", "Study", 10],
            ] as const
          ).map(([kind, label, fallback]) => (
            <Field key={kind} label={`${label} unit price (RM)`}>
              <input
                name={`${kind}UnitPrice`}
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                defaultValue={rules.unitPrices?.[kind] ?? fallback}
              />
            </Field>
          ))}
        </div>
        <h4>Bank transfer details</h4>
        <div className="workflow-form-grid">
          <Field label="Bank name">
            <input
              name="bankName"
              defaultValue={rules.bankName || ""}
              maxLength={150}
            />
          </Field>
          <Field label="Bank account name">
            <input
              name="bankAccountName"
              defaultValue={rules.bankAccountName || ""}
              maxLength={200}
            />
          </Field>
          <Field label="Bank account number">
            <input
              name="bankAccountNumber"
              defaultValue={rules.bankAccountNumber || ""}
              maxLength={80}
              inputMode="text"
            />
          </Field>
        </div>
        <Field
          label="DuitNow / wallet instructions"
          hint="Visible to students. Include the recipient and how to obtain the campus payment QR code."
        >
          <textarea
            name="walletInstructions"
            defaultValue={rules.walletInstructions || ""}
            maxLength={2000}
          />
        </Field>
        <button type="submit" className="primary-button">
          {operation.pending ? "Saving settings…" : "Save payment settings"}
        </button>
      </fieldset>
      <Feedback operation={operation} />
    </form>
  );
}

function CourseDocument({
  order,
  data,
  rules,
  onClose,
}: {
  order: Row;
  data: Data;
  rules: RecordingOperationsData["rules"];
  onClose: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const isPaid = order.status === "paid";
  const hasReceipt = isPaid && !!order.receipt_no;
  const waiver =
    isPaid && (order.method === "fee_waiver" || amount(order) === 0);
  let ticketSummary = '';
  try {
    const offer = JSON.parse(String(order.offer_snapshot || '{}'));
    if (offer.product) ticketSummary = `${Number(offer.product.onsite_credits || 0)} onsite · ${Number(offer.product.online_credits || 0)} online · ${Number(offer.product.study_credits || 0)} study`;
  } catch { /* Older bills may not have a saved ticket breakdown. */ }
  const title =
    isPaid && !hasReceipt
      ? "Paid course bill"
      : waiver
        ? "Course fee waiver confirmation"
        : isPaid
          ? "Official course payment receipt"
          : "Course invoice";
  return (
    <div
      className="workflow-modal recording-document-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recording-document-title"
        tabIndex={-1}
        className="workflow-card workflow-print recording-receipt"
      >
        <button type="button" className="quiet-button no-print recording-document-close" onClick={onClose}>Close preview</button>
        <div className="recording-receipt-brand">
          <strong>UniqGuru Pintar</strong>
          <span>Education & learning services</span>
        </div>
        <h2 id="recording-document-title">{title}</h2>
        {isPaid && !hasReceipt ? (
          <p className="workflow-alert">
            This bill was marked paid before a detailed receipt was recorded
            here. Contact the campus for its original payment receipt.
          </p>
        ) : null}
        <dl className="workflow-details">
          <div>
            <dt>
              {isPaid ? "Receipt / confirmation number" : "Bill reference"}
            </dt>
            <dd>
              {isPaid
                ? val(order, "receipt_no") || val(order, "id")
                : val(order, "id")}
            </dd>
          </div>
          <div>
            <dt>Student</dt>
            <dd>{learnerName(order, data.students)}</dd>
          </div>
          <div>
            <dt>Bill reference</dt>
            <dd>{val(order, "id")}</dd>
          </div>
          <div>
            <dt>Service month</dt>
            <dd>{monthLabel(orderMonth(order))}</dd>
          </div>
          <div>
            <dt>
              {isPaid
                ? waiver
                  ? "Approval date"
                  : "Payment received"
                : "Payment deadline"}
            </dt>
            <dd>
              {dateLabel(
                isPaid ? order.received_at || order.paid_at : order.due_at,
                isPaid,
              )}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{waiver ? "Approved fee waiver" : words(order.status)}</dd>
          </div>
        </dl>
        <table className="recording-receipt-table">
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {orderLabel(order, data.runs)}
                <small>
                  {monthLabel(orderMonth(order))} · {words(order.delivery_mode)}
                </small>
                {ticketSummary ? <small>{ticketSummary}</small> : null}
              </td>
              <td>{money(originalAmount(order))}</td>
            </tr>
            {originalAmount(order) !== amount(order) ? (
              <tr>
                <td>Approved adjustment</td>
                <td>{money(amount(order) - originalAmount(order))}</td>
              </tr>
            ) : null}
            <tr className="recording-total">
              <th scope="row">Agreed total</th>
              <td>{money(amount(order))}</td>
            </tr>
            {isPaid ? (
              <tr>
                <th scope="row">
                  {waiver ? "Amount payable after waiver" : "Amount received"}
                </th>
                <td>
                  {money(
                    waiver
                      ? 0
                      : order.receipt_amount_cents == null
                        ? (order.paid_amount ?? amount(order))
                        : Number(order.receipt_amount_cents) / 100,
                  )}
                </td>
              </tr>
            ) : (
              <tr>
                <th scope="row">Outstanding</th>
                <td>{money(balance(order))}</td>
              </tr>
            )}
          </tbody>
        </table>
        {isPaid ? (
          <dl className="workflow-details">
            <div>
              <dt>Payment method</dt>
              <dd>
                {words(
                  order.method || (waiver ? "fee_waiver" : "Not recorded"),
                )}
              </dd>
            </div>
            <div>
              <dt>Transaction / approval reference</dt>
              <dd>{val(order, "reference") || "Not supplied"}</dd>
            </div>
            {order.received_by ? (
              <div>
                <dt>Recorded by</dt>
                <dd>{val(order, "received_by")}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {order.adjustment_reason || order.note ? (
          <p className="recording-note">
            Arrangement: {val(order, "adjustment_reason") || val(order, "note")}
          </p>
        ) : null}
        {order.payment_note ? (
          <p className="recording-note">
            Payment note: {val(order, "payment_note")}
          </p>
        ) : null}
        <p className="workflow-muted">
          Tickets apply to the stated calendar month. Campus-approved
          replacement lessons are recorded separately.
        </p>
        {!isPaid && (rules.bankName || rules.walletInstructions) ? (
          <div className="recording-receipt-payment">
            <strong>Payment details</strong>
            <p>
              {[rules.bankName, rules.bankAccountName, rules.bankAccountNumber]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p>{rules.walletInstructions}</p>
            <p>This invoice is not a payment receipt.</p>
          </div>
        ) : null}
        {waiver ? (
          <p>No money was collected for this approved zero-fee bill.</p>
        ) : null}
        <div className="workflow-actions no-print">
          <button
            type="button"
            className="primary-button"
            onClick={() => window.print()}
          >
            Print / save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
