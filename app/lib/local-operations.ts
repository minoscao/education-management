import {
  LearningStore,
  malaysiaDay,
  malaysiaTime,
  type Database,
  type Query,
  type RecordData as Row,
  type CreditType,
} from "./learning-store";
import { BusinessWorkflow, validDate } from "./business-workflow";
import { AccessError, type PortalActor } from "./portal-auth";

export type OperatingRules = {
  monthlyDueDay: number | null;
  firstMonthManual: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  walletInstructions: string;
  unitPrices: { onsite: number; online: number; study: number };
};
const defaults: OperatingRules = {
  monthlyDueDay: null,
  firstMonthManual: true,
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  walletInstructions: "",
  unitPrices: { onsite: 20, online: 10, study: 10 },
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const money = (v: unknown) => {
  if (!["string", "number"].includes(typeof v) || String(v).trim() === "")
    throw new AccessError("Enter the amount explicitly.", 400);
  const n = Number(v);
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    n > 1_000_000 ||
    Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
  )
    throw new AccessError("Enter an amount with at most two decimals.", 400);
  return Math.round(n * 100);
};
const mode = (v: unknown): "onsite" | "online" => {
  if (v !== "onsite" && v !== "online")
    throw new AccessError("Choose an attendance mode.", 400);
  return v;
};
const note = (input: Row) => {
  const n = str(input.note);
  if (!n || n.length > 2000)
    throw new AccessError(
      "Record a reason using 2,000 characters or fewer.",
      400,
    );
  return n;
};
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_, value) =>
    value && !Array.isArray(value) && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
const systemActor: PortalActor = {
  id: "system",
  email: "",
  display_name: "System",
  role: "admin",
  student_id: null,
  teacher_id: null,
};

export class LocalOperations {
  readonly learning: LearningStore;
  readonly workflow: BusinessWorkflow;
  constructor(
    readonly db: Database,
    readonly now: () => Date = () => new Date(),
  ) {
    this.workflow = new BusinessWorkflow(db);
    this.learning = new LearningStore(db, now, (student, run, session) =>
      this.assertBooking(student, run, session),
    );
  }
  one<T = Row>(sql: string, values: unknown[] = []) {
    return this.workflow.one<T>(sql, values);
  }
  all<T = Row>(sql: string, values: unknown[] = []) {
    return this.workflow.all<T>(sql, values);
  }
  batch(queries: Query[]) {
    return this.workflow.batch(queries);
  }
  assertBooking(studentId: string, runId?: string, sessionId?: string) {
    return this.workflow.assertBooking(studentId, runId, sessionId);
  }
  private admin(actor: PortalActor) {
    if (actor.role !== "admin")
      throw new AccessError("An administrator must perform this operation.");
  }
  private key(input: Row) {
    const key = str(input.requestKey);
    if (!/^[\w:-]{8,160}$/.test(key))
      throw new AccessError("Refresh this form and try again.", 400);
    return key;
  }
  private day(v: unknown, allowEmpty = true) {
    const value = str(v);
    if (!value && allowEmpty) return "";
    if (!validDate(value)) throw new AccessError("Choose a valid date.", 400);
    return value;
  }
  private async prior(input: Row, action: string, subject: string) {
    const key = this.key(input);
    const row = await this.one(
      "SELECT * FROM operating_events WHERE request_key=?",
      [key],
    );
    if (
      row &&
      (row.action !== action ||
        row.subject_id !== subject ||
        row.payload_json !== canonical(input))
    )
      throw new AccessError(
        "This request reference was already used for different details.",
        409,
      );
    return row;
  }
  private event(
    input: Row,
    actor: PortalActor,
    action: string,
    subject: string,
    before: unknown = {},
    after: unknown = {},
  ): Query {
    return {
      sql: "INSERT INTO operating_events(id,request_key,action,actor_id,subject_id,payload_json,before_json,after_json,note) VALUES (?,?,?,?,?,?,?,?,?)",
      values: [
        crypto.randomUUID(),
        this.key(input),
        action,
        actor.id,
        subject,
        canonical(input),
        canonical(before),
        canonical(after),
        str(input.note),
      ],
    };
  }
  private async commit(
    input: Row,
    actor: PortalActor,
    action: string,
    subject: string,
    queries: Query[],
    before: unknown = {},
    after: unknown = {},
  ) {
    if (await this.prior(input, action, subject)) return;
    try {
      await this.batch([
        this.event(input, actor, action, subject, before, after),
        ...queries,
      ]);
    } catch (error) {
      if (await this.prior(input, action, subject)) return;
      throw error;
    }
  }
  private guard(condition: string, values: unknown[]): Query[] {
    const id = crypto.randomUUID();
    return [
      {
        sql: `INSERT INTO operation_guards(id,valid) SELECT ?,CASE WHEN ${condition} THEN 1 ELSE 0 END`,
        values: [id, ...values],
      },
      { sql: "DELETE FROM operation_guards WHERE id=?", values: [id] },
    ];
  }
  private orderGuard(order: Row): Query[] {
    return this.guard(
      "EXISTS(SELECT 1 FROM pass_orders o JOIN pass_order_controls c ON c.order_id=o.id WHERE o.id=? AND o.status!='paid' AND c.revision=?)",
      [order.id, Number(order.revision)],
    );
  }
  private async order(id: unknown) {
    const row = await this.one(
      "SELECT o.*,c.original_amount_cents,c.manual_review,c.revision,c.adjustment_reason FROM pass_orders o JOIN pass_order_controls c ON c.order_id=o.id WHERE o.id=?",
      [str(id)],
    );
    if (!row) throw new AccessError("Course order not found.", 404);
    return row;
  }
  async rules(): Promise<OperatingRules> {
    const row = await this.one<{ value: string }>(
      "SELECT value FROM app_settings WHERE key='recording_operations_v1'",
    );
    try {
      const value = JSON.parse(row?.value || "{}");
      return {
        ...defaults,
        ...value,
        unitPrices: { ...defaults.unitPrices, ...value.unitPrices },
      };
    } catch {
      return { ...defaults };
    }
  }
  async saveRules(input: Row, actor: PortalActor) {
    this.admin(actor);
    const day =
      input.monthlyDueDay == null || input.monthlyDueDay === ""
        ? null
        : Number(input.monthlyDueDay);
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31))
      throw new AccessError(
        "Choose a monthly due day from 1 to 31, or leave it unset.",
        400,
      );
    const previous = await this.rules(),
      prices =
        input.unitPrices && typeof input.unitPrices === "object"
          ? (input.unitPrices as Row)
          : previous.unitPrices;
    const unitPrices = {
      onsite: money(prices.onsite) / 100,
      online: money(prices.online) / 100,
      study: money(prices.study) / 100,
    };
    const next: OperatingRules = {
      monthlyDueDay: day,
      firstMonthManual: input.firstMonthManual !== false,
      bankName: str(input.bankName),
      bankAccountName: str(input.bankAccountName),
      bankAccountNumber: str(input.bankAccountNumber),
      walletInstructions: str(input.walletInstructions),
      unitPrices,
    };
    if (
      Object.values(next).some((v) => typeof v === "string" && v.length > 2000)
    )
      throw new AccessError("Payment instructions are too long.", 400);
    const request = {
      ...input,
      requestKey: input.requestKey || crypto.randomUUID(),
    };
    await this.commit(
      request,
      actor,
      "saveOperatingRules",
      "rules",
      [
        {
          sql: "UPDATE app_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='recording_operations_v1'",
          values: [JSON.stringify(next)],
        },
      ],
      await this.rules(),
      next,
    );
    return {
      notice: "Operating rules saved. Existing order deadlines are unchanged.",
    };
  }
  async assertSelfService(studentId: string) {
    if (!(await this.rules()).firstMonthManual) return;
    if (
      await this.one(
        "SELECT student_id FROM student_monthly_plans WHERE student_id=? UNION SELECT student_id FROM pass_orders WHERE student_id=? AND status='paid' LIMIT 1",
        [studentId, studentId],
      )
    )
      return;
    throw new AccessError(
      "The campus is preparing your first-month plan. Your registration and selected course can be reviewed by an administrator.",
      409,
    );
  }
  async createManualCoursePlan(input: Row, actor: PortalActor) {
    this.admin(actor);
    const studentId = str(input.studentId),
      runId = str(input.runId);
    if (await this.prior(input, "createManualCoursePlan", studentId))
      return { notice: "This first-month plan is already saved." };
    const serviceMonth = str(input.serviceMonth);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(serviceMonth))
      throw new AccessError("Choose a service month.", 400);
    const credits = {
      onsite: Number(input.onsiteCredits),
      online: Number(input.onlineCredits),
      study: Number(input.studyCredits),
    };
    if (
      Object.values(credits).some(
        (n) => !Number.isInteger(n) || n < 0 || n > 100,
      ) ||
      credits.onsite + credits.online + credits.study < 1
    )
      throw new AccessError(
        "Enter explicit whole ticket quantities with at least one ticket overall.",
        400,
      );
    const cents = money(input.amount),
      reason = note(input),
      dueAt = this.day(input.dueAt);
    if (dueAt && dueAt < malaysiaDay(this.now()))
      throw new AccessError("Use today or a future payment deadline.", 400);
    const sessionIds =
      input.sessionIds === undefined
        ? undefined
        : Array.isArray(input.sessionIds)
          ? input.sessionIds.map(str)
          : null;
    if (
      sessionIds === null ||
      sessionIds?.some((id) => !id) ||
      (sessionIds && new Set(sessionIds).size !== sessionIds.length)
    )
      throw new AccessError(
        "Choose each first-month lesson at most once.",
        400,
      );
    const prices = (await this.rules()).unitPrices,
      suggestedCents =
        credits.onsite * money(prices.onsite) +
        credits.online * money(prices.online) +
        credits.study * money(prices.study);
    const result = await this.learning.checkoutCourse(
      {
        studentId,
        runId,
        requestKey: this.key(input),
        mode: mode(input.deliveryMode),
        scope: "full",
        funding: "package",
        payMonthly: true,
        includeExtra: input.includeExtra === true,
        manualTerms: {
          serviceMonth,
          amount: cents / 100,
          suggestedAmount: suggestedCents / 100,
          dueAt,
          credits,
          actorId: actor.id,
          note: reason,
          sessionIds,
          reserveFuture: input.reserveFuture !== false,
          futureExtraUnitPrice: prices[mode(input.deliveryMode)],
        },
      },
      [
        this.event(
          input,
          actor,
          "createManualCoursePlan",
          studentId,
          {},
          {
            runId,
            serviceMonth,
            amount_cents: cents,
            suggested_amount_cents: suggestedCents,
            unitPrices: prices,
            credits,
          },
        ),
      ],
    );
    if (!result.orderId)
      throw new AccessError(
        "These lessons are already booked. Adjust the existing order instead.",
        409,
      );
    return {
      notice:
        "First-month plan saved. Confirm the actual payment or fee waiver separately.",
      orderId: result.orderId,
    };
  }
  async adjustOrder(input: Row, actor: PortalActor) {
    this.admin(actor);
    const id = str(input.orderId);
    if (await this.prior(input, "adjustCourseOrder", id))
      return { notice: "Order adjustment already saved." };
    const order = await this.order(id);
    if (order.status === "paid")
      throw new AccessError(
        "A paid order must keep its original receipt. Use a separately recorded adjustment.",
        409,
      );
    const cents = money(input.amount),
      reason = note(input),
      due = this.day(input.dueAt);
    if (cents < Math.round(Number(order.paid_amount) * 100))
      throw new AccessError(
        "The adjusted total cannot be less than money already received.",
        400,
      );
    if (due && due < malaysiaDay(this.now()))
      throw new AccessError("Use today or a future payment deadline.", 400);
    const snapshot = JSON.parse(String(order.offer_snapshot || "{}"));
    if (snapshot.billing) {
      snapshot.billing.dueAt = due;
      snapshot.billing.basePrice = cents / 100;
    }
    const queries: Query[] = [
      ...this.orderGuard(order),
      {
        sql: "UPDATE pass_orders SET total_amount=?,due_at=?,offer_snapshot=? WHERE id=?",
        values: [cents / 100, due, JSON.stringify(snapshot), id],
      },
      {
        sql: "UPDATE pass_order_controls SET manual_review=0,adjustment_reason=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE order_id=?",
        values: [reason, id],
      },
      {
        sql: "UPDATE course_seat_holds SET deadline=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='held'",
        values: [due, id],
      },
    ];
    if (order.enrollment_id)
      queries.push({
        sql: "UPDATE class_enrollments SET contracted_fee=contracted_fee+? WHERE id=?",
        values: [cents / 100 - Number(order.total_amount), order.enrollment_id],
      });
    const month = String(
      order.billing_month ||
        snapshot.windows?.[0]?.from ||
        malaysiaDay(this.now()),
    ).slice(0, 7);
    queries.push({
      sql: "INSERT INTO student_monthly_plans(student_id,service_month,note,approved_by) VALUES (?,?,?,?) ON CONFLICT(student_id) DO NOTHING",
      values: [order.student_id, month, reason, actor.id],
    });
    await this.commit(
      input,
      actor,
      "adjustCourseOrder",
      id,
      queries,
      { amount: order.total_amount, dueAt: order.due_at },
      { amount_cents: cents, dueAt: due },
    );
    return { notice: "Order adjusted. No payment has been recorded." };
  }
  async extendHold(input: Row, actor: PortalActor) {
    this.admin(actor);
    const id = str(input.orderId);
    if (await this.prior(input, "extendCourseHold", id))
      return { notice: "Deadline already saved." };
    const order = await this.order(id);
    if (order.status === "paid")
      throw new AccessError("This order has already been paid.", 409);
    const deadline = this.day(input.deadline, false),
      reason = note(input);
    if (deadline < malaysiaDay(this.now()))
      throw new AccessError("Choose today or a future deadline.", 400);
    const snapshot = JSON.parse(String(order.offer_snapshot || "{}"));
    if (snapshot.billing) snapshot.billing.dueAt = deadline;
    await this.commit(
      input,
      actor,
      "extendCourseHold",
      id,
      [
        ...this.orderGuard(order),
        {
          sql: "UPDATE pass_orders SET due_at=?,offer_snapshot=? WHERE id=?",
          values: [deadline, JSON.stringify(snapshot), id],
        },
        {
          sql: "UPDATE pass_order_controls SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE order_id=?",
          values: [id],
        },
        {
          sql: "UPDATE course_seat_holds SET deadline=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='held'",
          values: [deadline, id],
        },
      ],
      { deadline: order.due_at },
      { deadline, reason },
    );
    return {
      notice:
        "Deadline updated. Previously released seats are checked again when payment is confirmed.",
    };
  }
  async releaseHold(input: Row, actor: PortalActor = systemActor) {
    this.admin(actor);
    const id = str(input.orderId);
    if (await this.prior(input, "releaseCourseHold", id))
      return { notice: "Seats already processed.", released: 0 };
    const order = await this.order(id);
    if (order.status === "paid")
      return { notice: "Paid seats remain confirmed.", released: 0 };
    const reason = note(input),
      holds = await this.all(
        "SELECT h.*,b.class_session_id FROM course_seat_holds h JOIN class_student_bookings b ON b.id=h.booking_id JOIN class_sessions s ON s.id=b.class_session_id WHERE h.order_id=? AND h.status='held' AND b.status='booked' AND s.starts_at>?",
        [id, malaysiaTime(this.now())],
      );
    const overdue = input.overdue === true;
    if (
      overdue &&
      (!order.due_at || String(order.due_at) >= malaysiaDay(this.now()))
    )
      return { notice: "The deadline has not passed.", released: 0 };
    if (!holds.length)
      return { notice: "No future held seats to release.", released: 0 };
    const queries: Query[] = [...this.orderGuard(order)];
    if (overdue)
      queries.push(
        ...this.guard(
          "EXISTS(SELECT 1 FROM pass_orders WHERE id=? AND due_at!='' AND due_at<?)",
          [id, malaysiaDay(this.now())],
        ),
      );
    for (const h of holds)
      queries.push(
        {
          // Record the cause before cancelling; the generic lifecycle trigger
          // must not reinterpret a payment-deadline release as a personal leave.
          sql: "UPDATE course_seat_holds SET status='released',release_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='held'",
          values: [overdue ? "overdue" : "administrator", h.id],
        },
        {
          sql: "UPDATE learning_credit_events SET status='released',updated_at=CURRENT_TIMESTAMP WHERE booking_id=? AND status='reserved'",
          values: [h.booking_id],
        },
        {
          sql: "UPDATE class_student_bookings SET status='cancelled',point_penalty=0 WHERE id=? AND status='booked'",
          values: [h.booking_id],
        },
        {
          sql: "UPDATE class_attendance SET status='leave',note=? WHERE student_booking_id=? AND status='pending'",
          values: [reason, h.booking_id],
        },
      );
    queries.push({
      sql: "UPDATE pass_order_controls SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE order_id=?",
      values: [id],
    });
    await this.commit(
      input,
      actor,
      "releaseCourseHold",
      id,
      queries,
      {},
      { reason, released: holds.length },
    );
    return {
      notice: `Released ${holds.length} future seat(s). The unpaid bill remains available for reconciliation.`,
      released: holds.length,
    };
  }
  async releaseOverdue(input: Row = {}, actor?: PortalActor) {
    if (actor) {
      this.admin(actor);
      if (input.requestKey) this.key(input);
    }
    const orders = await this.all(
      "SELECT DISTINCT o.id,o.due_at FROM pass_orders o JOIN course_seat_holds h ON h.order_id=o.id JOIN class_student_bookings b ON b.id=h.booking_id JOIN class_sessions s ON s.id=b.class_session_id WHERE o.status!='paid' AND o.due_at!='' AND o.due_at<? AND h.status='held' AND b.status='booked' AND s.starts_at>?",
      [malaysiaDay(this.now()), malaysiaTime(this.now())],
    );
    let released = 0;
    for (const order of orders) {
      try {
        const result = await this.releaseHold(
          {
            orderId: order.id,
            note: "Payment deadline passed; future unpaid seats released.",
            overdue: true,
            requestKey: `overdue:${order.id}:${order.due_at}`,
          },
          actor || systemActor,
        );
        released += result.released;
      } catch (error) {
        const fresh = await this.order(order.id);
        if (fresh.status !== "paid" && fresh.due_at === order.due_at)
          throw error;
      }
    }
    return {
      notice: `Processed expired reservations: ${released} seat(s) released.`,
      released,
    };
  }
  async confirmPayment(input: Row, actor: PortalActor) {
    this.admin(actor);
    const id = str(input.orderId);
    if (await this.prior(input, "confirmCoursePayment", id))
      return {
        notice: "Payment already recorded.",
        receipt: await this.one(
          "SELECT * FROM course_payment_receipts WHERE order_id=?",
          [id],
        ),
      };
    const order = await this.order(id);
    if (order.status === "paid")
      return {
        notice: "This order is already paid.",
        receipt: await this.one(
          "SELECT * FROM course_payment_receipts WHERE order_id=?",
          [id],
        ),
      };
    if (Number(order.manual_review))
      throw new AccessError(
        "Review and approve the first-month price and deadline before recording payment.",
        409,
      );
    const received = money(input.receivedAmount),
      remaining = Math.round(
        (Number(order.total_amount) - Number(order.paid_amount)) * 100,
      ),
      method = str(input.method),
      reason = str(input.note);
    if (received !== remaining)
      throw new AccessError(
        "The amount received must match this order’s remaining balance. Adjust an unpaid bill separately if necessary.",
        400,
      );
    if (
      !["cash", "bank_transfer", "duitnow_qr", "fee_waiver"].includes(method) ||
      (remaining === 0) !== (method === "fee_waiver")
    )
      throw new AccessError(
        "Use fee waiver only for a zero-value unpaid balance.",
        400,
      );
    if (method === "fee_waiver") note(input);
    const reference = str(input.reference);
    if (["bank_transfer", "duitnow_qr"].includes(method) && !reference)
      throw new AccessError(
        "Record the bank or wallet transaction reference.",
        400,
      );
    const receivedAt = str(input.receivedAt).replace("T", " ");
    if (
      !/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(receivedAt) ||
      !validDate(receivedAt.slice(0, 10)) ||
      receivedAt > malaysiaTime(this.now()).slice(0, 16)
    )
      throw new AccessError(
        "Record a valid receipt time that is not in the future.",
        400,
      );
    const holds = await this.all(
      "SELECT h.*,b.class_session_id,b.student_id,s.starts_at,s.class_run_id FROM course_seat_holds h JOIN class_student_bookings b ON b.id=h.booking_id JOIN class_sessions s ON s.id=b.class_session_id WHERE h.order_id=? AND h.status='released' AND h.release_reason IN('overdue','administrator') AND s.starts_at>? AND s.status NOT IN('cancelled','completed')",
      [id, malaysiaTime(this.now())],
    );
    if (holds.length) {
      await this.assertBooking(
        String(order.student_id),
        String(order.selected_run_id),
      );
      await this.learning.assertBookingAvailable(
        String(order.student_id),
        String(order.selected_run_id),
        undefined,
        mode(order.delivery_mode),
        holds.map((h) => String(h.class_session_id)),
      );
    }
    const queries: Query[] = [
      ...this.orderGuard(order),
      ...this.guard(
        "EXISTS(SELECT 1 FROM pass_order_controls WHERE order_id=? AND manual_review=0)",
        [id],
      ),
    ];
    for (const h of holds)
      queries.push(
        ...this.guard(
          "EXISTS(SELECT 1 FROM course_seat_holds h JOIN class_student_bookings b ON b.id=h.booking_id JOIN class_sessions s ON s.id=b.class_session_id WHERE h.id=? AND h.status='released' AND b.status='cancelled' AND s.status NOT IN('cancelled','completed') AND s.starts_at>?)",
          [h.id, malaysiaTime(this.now())],
        ),
        {
          sql: "UPDATE class_student_bookings SET status='booked',point_penalty=0 WHERE id=? AND status='cancelled'",
          values: [h.booking_id],
        },
        {
          sql: "UPDATE class_attendance SET status='pending',note='',marked_at=CURRENT_TIMESTAMP WHERE student_booking_id=?",
          values: [h.booking_id],
        },
      );
    await this.learning.payPass(
      id,
      method,
      reference,
      reason,
      queries,
      holds.map((h) => String(h.booking_id)),
    );
    for (const h of holds)
      queries.push({
        sql: "UPDATE course_seat_holds SET status='confirmed',release_reason='',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        values: [h.id],
      });
    const receiptNo = `CR-${receivedAt.slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 12).replaceAll("-", "").toUpperCase()}`;
    queries.push(
      {
        sql: "INSERT INTO course_payment_receipts(id,order_id,receipt_no,amount_cents,method,reference,received_at,received_by,note,request_key) VALUES (?,?,?,?,?,?,?,?,?,?)",
        values: [
          `receipt:${id}`,
          id,
          receiptNo,
          received,
          method,
          reference,
          receivedAt,
          actor.id,
          reason,
          this.key(input),
        ],
      },
      {
        sql: "UPDATE pass_payments SET received_at=? WHERE id=?",
        values: [receivedAt, `${id}:payment`],
      },
      {
        sql: "UPDATE pass_order_controls SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE order_id=?",
        values: [id],
      },
    );
    await this.commit(
      input,
      actor,
      "confirmCoursePayment",
      id,
      queries,
      { status: order.status },
      { amount_cents: received, method, receiptNo },
    );
    let attention = "";
    try {
      await this.learning.completePassBooking(id);
    } catch (error) {
      attention = ` Reservation needs review: ${error instanceof Error ? error.message : "Contact the campus."}`;
    }
    return {
      notice: `Receipt ${receiptNo} recorded.${attention}`,
      receipt: await this.one(
        "SELECT * FROM course_payment_receipts WHERE order_id=?",
        [id],
      ),
    };
  }

  private compensation(
    studentId: string,
    type: CreditType,
    day: string,
    passId: string,
    bookingId: string,
    productId: string,
  ): Query[] {
    return [
      {
        sql: "INSERT INTO student_passes(id,student_id,product_id,name,credit_type,credits_total,valid_from,valid_until,onsite_remaining,online_remaining,study_remaining,status,issuance_key) VALUES (?,?,?,'Campus approved replacement',?,1,?,?,?,?,?,'active',?)",
        values: [
          passId,
          studentId,
          productId,
          type,
          day,
          day,
          type === "onsite" ? 1 : 0,
          type === "online" ? 1 : 0,
          type === "study" ? 1 : 0,
          passId,
        ],
      },
      {
        sql: "INSERT INTO learning_credit_events(id,student_id,pass_id,booking_id,credit_type,service_date,status) VALUES (?,?,?,?,?,?,'reserved')",
        values: [
          `lesson:${bookingId}`,
          studentId,
          passId,
          bookingId,
          type,
          day,
        ],
      },
    ];
  }
  async convertBooking(input: Row, actor: PortalActor) {
    this.admin(actor);
    const id = str(input.bookingId);
    if (await this.prior(input, "convertLessonMode", id))
      return { notice: "Attendance change already saved." };
    const reason = note(input),
      target = mode(input.deliveryMode),
      policy = str(input.creditPolicy);
    if (
      !["keep_original", "use_target_credit", "campus_waiver"].includes(policy)
    )
      throw new AccessError(
        "Explicitly choose how tickets will be handled.",
        400,
      );
    const booking = await this.one(
      "SELECT b.*,s.starts_at,s.online_url,s.class_run_id,s.status AS session_status FROM class_student_bookings b JOIN class_sessions s ON s.id=b.class_session_id WHERE b.id=?",
      [id],
    );
    if (
      !booking ||
      booking.status !== "booked" ||
      ["cancelled", "completed"].includes(String(booking.session_status)) ||
      String(booking.starts_at) <= malaysiaTime(this.now())
    )
      throw new AccessError("Choose an active future booking.", 400);
    if (booking.delivery_mode === target)
      throw new AccessError(
        "This booking already uses that attendance mode.",
        400,
      );
    await this.assertBooking(
      String(booking.student_id),
      undefined,
      String(booking.class_session_id),
    );
    if (target === "online") {
      let validLink = false;
      try {
        validLink = new URL(String(booking.online_url)).protocol === "https:";
      } catch {
        /* An incomplete link cannot authorize the mode change. */
      }
      if (!validLink)
        throw new AccessError(
          "Add the secure online classroom link first.",
          400,
        );
    }
    const event = await this.one(
      "SELECT * FROM learning_credit_events WHERE booking_id=? AND status IN('reserved','consumed')",
      [id],
    );
    if (event?.status === "consumed")
      throw new AccessError(
        "An already used lesson cannot change ticket type.",
        409,
      );
    const pending = await this.one(
      "SELECT h.id FROM course_seat_holds h JOIN pass_orders o ON o.id=h.order_id WHERE h.booking_id=? AND o.status!='paid'",
      [id],
    );
    if (pending)
      throw new AccessError(
        "Confirm or reconcile the existing course bill before changing attendance mode.",
        409,
      );
    if (booking.payment_source === "course" && policy !== "keep_original")
      throw new AccessError(
        "For a directly paid course, keep its original paid funding; review any price adjustment separately.",
        400,
      );
    if (
      booking.payment_source === "pass" &&
      policy === "keep_original" &&
      !event
    )
      throw new AccessError(
        "There is no reserved original ticket to retain.",
        400,
      );
    const queries: Query[] = [
      ...this.guard(
        "EXISTS(SELECT 1 FROM class_student_bookings b JOIN class_sessions s ON s.id=b.class_session_id WHERE b.id=? AND b.status='booked' AND b.delivery_mode=? AND s.status NOT IN('cancelled','completed') AND s.starts_at>?)",
        [id, booking.delivery_mode, malaysiaTime(this.now())],
      ),
    ];
    queries.push(
      ...this.guard(
        "NOT EXISTS(SELECT 1 FROM learning_credit_events WHERE booking_id=? AND status='consumed')",
        [id],
      ),
    );
    if (event)
      queries.push(
        ...this.guard(
          "EXISTS(SELECT 1 FROM learning_credit_events WHERE id=? AND pass_id=? AND status='reserved')",
          [event.id, event.pass_id],
        ),
      );
    if (booking.payment_source === "pass" && policy !== "keep_original") {
      queries.push(
        {
          sql: "UPDATE learning_credit_events SET status='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='reserved'",
          values: [`lesson:${id}`],
        },
        {
          sql: "DELETE FROM learning_credit_events WHERE id=? AND status='released'",
          values: [`lesson:${id}`],
        },
      );
      if (policy === "campus_waiver") {
        const product = await this.one(
          "SELECT id FROM pass_products WHERE status='active' ORDER BY sort_order LIMIT 1",
        );
        if (!product)
          throw new AccessError(
            "Configure a learning product before granting a replacement ticket.",
            400,
          );
        queries.push(
          ...this.compensation(
            String(booking.student_id),
            target,
            String(booking.starts_at).slice(0, 10),
            `mode:${this.key(input)}`,
            id,
            String(product.id),
          ),
        );
      } else {
        const tickets = await this.all(
          `SELECT p.id,p.${target}_remaining-(SELECT COUNT(*) FROM learning_credit_events e WHERE e.pass_id=p.id AND e.status='reserved') AS available FROM student_passes p WHERE p.student_id=? AND p.credit_type=? AND p.status='active' AND p.valid_from<=? AND p.valid_until>=? ORDER BY p.valid_until,p.id`,
          [
            booking.student_id,
            target,
            String(booking.starts_at).slice(0, 10),
            String(booking.starts_at).slice(0, 10),
          ],
        );
        const ticket = tickets.find((t) => Number(t.available) > 0);
        if (!ticket)
          throw new AccessError(
            "No valid target-mode ticket is available.",
            400,
          );
        queries.push({
          sql: "INSERT INTO learning_credit_events(id,student_id,pass_id,booking_id,credit_type,service_date,status) VALUES (?,?,?,?,?,?,'reserved')",
          values: [
            `lesson:${id}`,
            booking.student_id,
            ticket.id,
            id,
            target,
            String(booking.starts_at).slice(0, 10),
          ],
        });
      }
    }
    queries.push({
      sql: "UPDATE class_student_bookings SET delivery_mode=? WHERE id=?",
      values: [target, id],
    });
    await this.commit(
      input,
      actor,
      "convertLessonMode",
      id,
      queries,
      { mode: booking.delivery_mode, credit: event?.credit_type },
      { mode: target, creditPolicy: policy, reason },
    );
    return { notice: "Attendance mode and ticket treatment updated together." };
  }
  async scheduleMakeup(input: Row, actor: PortalActor) {
    this.admin(actor);
    const originalId = str(input.originalSessionId),
      targetId = str(input.targetSessionId),
      reason = note(input);
    if (await this.prior(input, "scheduleCampusMakeup", originalId))
      return { notice: "Makeup arrangement already saved." };
    if (originalId === targetId)
      throw new AccessError("Choose a separate replacement lesson.", 400);
    const original = await this.one(
      "SELECT s.*,r.course_id FROM class_sessions s JOIN class_runs r ON r.id=s.class_run_id WHERE s.id=?",
      [originalId],
    );
    const target = await this.one(
      "SELECT s.*,r.course_id,r.status AS run_status FROM class_sessions s JOIN class_runs r ON r.id=s.class_run_id WHERE s.id=?",
      [targetId],
    );
    if (!original || original.status !== "cancelled")
      throw new AccessError(
        "Cancel the original campus lesson before arranging its makeup.",
        400,
      );
    if (
      !target ||
      target.status === "cancelled" ||
      target.status === "completed" ||
      target.run_status !== "open" ||
      String(target.starts_at) <= malaysiaTime(this.now()) ||
      target.course_id !== original.course_id
    )
      throw new AccessError(
        "Choose a published future lesson for the same course.",
        400,
      );
    const students = Array.isArray(input.studentIds)
      ? [...new Set(input.studentIds.map(String))]
      : [];
    if (!students.length || students.length > 100)
      throw new AccessError("Choose 1 to 100 affected learners.", 400);
    const product = await this.one(
      "SELECT id FROM pass_products WHERE status='active' ORDER BY sort_order LIMIT 1",
    );
    if (!product)
      throw new AccessError(
        "Configure a learning product before issuing replacement tickets.",
        400,
      );
    const queries: Query[] = [
      ...this.guard(
        "EXISTS(SELECT 1 FROM class_sessions WHERE id=? AND status='cancelled') AND EXISTS(SELECT 1 FROM class_sessions s JOIN class_runs r ON r.id=s.class_run_id WHERE s.id=? AND s.status NOT IN('cancelled','completed') AND r.status='open' AND s.starts_at>?)",
        [originalId, targetId, malaysiaTime(this.now())],
      ),
    ];
    for (const studentId of students) {
      const old = await this.one(
        "SELECT b.*,e.pass_id FROM class_student_bookings b JOIN class_enrollments e ON e.id=b.enrollment_id WHERE b.class_session_id=? AND b.student_id=?",
        [originalId, studentId],
      );
      if (!old)
        throw new AccessError(
          "A selected learner was not booked in the original lesson.",
          400,
        );
      if (
        await this.one(
          "SELECT id FROM campus_makeups WHERE original_booking_id=?",
          [old.id],
        )
      )
        throw new AccessError(
          "A selected learner already has a makeup for this original lesson.",
          409,
        );
      if (
        !(await this.one(
          "SELECT booking_id FROM campus_cancelled_bookings WHERE booking_id=?",
          [old.id],
        ))
      )
        throw new AccessError(
          "This learner had already withdrawn before the campus cancellation. Review that cancellation separately.",
          409,
        );
      const oldEvent = await this.one(
        "SELECT e.*,p.product_id,p.valid_until FROM learning_credit_events e JOIN student_passes p ON p.id=e.pass_id WHERE e.booking_id=? ORDER BY e.created_at DESC LIMIT 1",
        [old.id],
      );
      if (old.payment_source === "pass" && !oldEvent)
        throw new AccessError(
          "Reconcile the original lesson payment before granting compensation.",
          409,
        );
      if (
        old.payment_source === "course" &&
        !(await this.one(
          "SELECT id FROM student_invoices WHERE enrollment_id=? AND status='paid'",
          [old.enrollment_id],
        ))
      )
        throw new AccessError(
          "The original course invoice must be paid before compensation.",
          409,
        );
      if (oldEvent?.status === "consumed")
        throw new AccessError(
          "The original lesson was already used; review it separately before compensation.",
          409,
        );
      await this.assertBooking(studentId, undefined, targetId);
      await this.learning.assertBookingAvailable(
        studentId,
        String(target.class_run_id),
        targetId,
        mode(old.delivery_mode),
      );
      const existing = await this.one(
        "SELECT id,status FROM class_student_bookings WHERE student_id=? AND class_session_id=?",
        [studentId, targetId],
      );
      if (existing?.status === "booked")
        throw new AccessError(
          "A selected learner is already booked in the replacement lesson.",
          409,
        );
      const enrollment = await this.one(
        "SELECT id FROM class_enrollments WHERE student_id=? AND class_run_id=?",
        [studentId, target.class_run_id],
      );
      const enrollmentId = String(
          enrollment?.id ||
            `makeup-enrollment:${studentId}:${target.class_run_id}`,
        ),
        bookingId = String(existing?.id || `${studentId}:${targetId}`),
        passId = `makeup-ticket:${old.id}`;
      if (!enrollment)
        queries.push({
          sql: "INSERT INTO class_enrollments(id,class_run_id,student_id,contracted_fee,status,delivery_mode) VALUES (?,?,?,0,'single_lesson',?)",
          values: [
            enrollmentId,
            target.class_run_id,
            studentId,
            old.delivery_mode,
          ],
        });
      if (existing)
        queries.push(
          {
            sql: "DELETE FROM learning_credit_events WHERE id=? AND status='released'",
            values: [`lesson:${bookingId}`],
          },
          {
            sql: "UPDATE class_student_bookings SET enrollment_id=?,status='booked',point_penalty=0,delivery_mode=?,payment_source='pass',allocated_fee=0 WHERE id=?",
            values: [enrollmentId, old.delivery_mode, bookingId],
          },
        );
      else
        queries.push({
          sql: "INSERT INTO class_student_bookings(id,class_session_id,enrollment_id,student_id,allocated_fee,status,delivery_mode,payment_source) VALUES (?,?,?,?,0,'booked',?,'pass')",
          values: [
            bookingId,
            targetId,
            enrollmentId,
            studentId,
            old.delivery_mode,
          ],
        });
      // Retire the returned original entitlement before issuing a date-specific replacement.
      if (oldEvent) {
        const credit = String(oldEvent.credit_type);
        if (!["onsite", "online", "study"].includes(credit))
          throw new AccessError("Review the original ticket type.", 409);
        queries.push(
          ...this.guard(
            `EXISTS(SELECT 1 FROM learning_credit_events e JOIN student_passes p ON p.id=e.pass_id WHERE e.id=? AND e.status='released' AND p.${credit}_remaining>(SELECT COUNT(*) FROM learning_credit_events r WHERE r.pass_id=p.id AND r.status='reserved'))`,
            [oldEvent.id],
          ),
          {
            sql: `UPDATE student_passes SET ${credit}_remaining=${credit}_remaining-1 WHERE id=?`,
            values: [oldEvent.pass_id],
          },
          {
            sql: "INSERT INTO learning_credit_history(event_id,pass_id,student_id,credit_type,service_date,status) VALUES (?,?,?,?,?,'transferred_to_makeup')",
            values: [
              oldEvent.id,
              oldEvent.pass_id,
              studentId,
              credit,
              oldEvent.service_date,
            ],
          },
        );
      }
      queries.push(
        ...this.compensation(
          studentId,
          mode(old.delivery_mode),
          String(target.starts_at).slice(0, 10),
          passId,
          bookingId,
          String(product.id),
        ),
        {
          sql: "INSERT INTO class_attendance(id,student_booking_id,status,note) SELECT ?,?,'pending',? WHERE NOT EXISTS(SELECT 1 FROM class_attendance WHERE student_booking_id=?)",
          values: [`attendance:${bookingId}`, bookingId, reason, bookingId],
        },
        {
          sql: "UPDATE class_attendance SET status='pending',note=?,marked_at=CURRENT_TIMESTAMP WHERE student_booking_id=?",
          values: [reason, bookingId],
        },
        {
          sql: "INSERT INTO campus_makeups(id,original_session_id,target_session_id,student_id,original_booking_id,new_booking_id,compensation_pass_id,reason,created_by) VALUES (?,?,?,?,?,?,?,?,?)",
          values: [
            crypto.randomUUID(),
            originalId,
            targetId,
            studentId,
            old.id,
            bookingId,
            passId,
            reason,
            actor.id,
          ],
        },
      );
    }
    await this.commit(
      input,
      actor,
      "scheduleCampusMakeup",
      originalId,
      queries,
      {},
      { targetId, students, reason },
    );
    return {
      notice: `Makeup booked for ${students.length} learner(s), with linked replacement tickets.`,
    };
  }
  async snapshot(actor: PortalActor) {
    const own = actor.role === "admin" ? "" : " WHERE o.student_id=?",
      values = actor.role === "admin" ? [] : [actor.student_id || ""];
    const orders = await this.all(
      `SELECT o.*,s.name AS student_name,c.original_amount_cents,CAST(ROUND(o.total_amount*100) AS INTEGER) AS amount_cents,c.manual_review,c.adjustment_reason,r.receipt_no,r.amount_cents AS receipt_amount_cents,r.received_at,r.received_by,r.method,r.reference,r.note,r.note AS payment_note FROM pass_orders o JOIN students s ON s.id=o.student_id JOIN pass_order_controls c ON c.order_id=o.id LEFT JOIN course_payment_receipts r ON r.order_id=o.id${own} ORDER BY o.created_at DESC`,
      values,
    );
    const holds = await this.all(
      `SELECT h.*,b.student_id,b.class_session_id,s.name AS student_name,c.topic,c.starts_at FROM course_seat_holds h JOIN pass_orders o ON o.id=h.order_id JOIN class_student_bookings b ON b.id=h.booking_id JOIN students s ON s.id=b.student_id JOIN class_sessions c ON c.id=b.class_session_id${own} ORDER BY c.starts_at`,
      values,
    );
    const plans = await this.all(
      `SELECT * FROM student_monthly_plans${actor.role === "admin" ? "" : " WHERE student_id=?"}`,
      values,
    );
    const required = await this.all(
      `SELECT s.id FROM students s WHERE NOT EXISTS(SELECT 1 FROM student_monthly_plans p WHERE p.student_id=s.id) AND NOT EXISTS(SELECT 1 FROM pass_orders p WHERE p.student_id=s.id AND p.status='paid')${actor.role === "admin" ? "" : " AND s.id=?"}`,
      values,
    );
    const makeups = await this.all(
      `SELECT * FROM campus_makeups${actor.role === "admin" ? "" : " WHERE student_id=?"} ORDER BY created_at DESC`,
      values,
    );
    const cancelledBookings = await this.all(
      `SELECT c.booking_id,c.session_id,b.student_id FROM campus_cancelled_bookings c JOIN class_student_bookings b ON b.id=c.booking_id${actor.role === "admin" ? "" : " WHERE b.student_id=?"}`,
      values,
    );
    const rules = await this.rules();
    return {
      rules,
      orders,
      holds,
      firstMonthPlans: plans,
      firstMonthRequired: rules.firstMonthManual
        ? required.map((s) => String(s.id))
        : [],
      makeups,
      cancelledBookings,
      events:
        actor.role === "admin"
          ? await this.all(
              "SELECT id,action,actor_id,subject_id,note,created_at FROM operating_events ORDER BY created_at DESC LIMIT 200",
            )
          : [],
    };
  }
}
