import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { fixture } from "./workflow-fixture.mjs";

// Compile the actual service modules with normal CommonJS circular-import semantics.
const cache = new Map(),
  nativeRequire = createRequire(import.meta.url);
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const loadedModule = { exports: {} };
  cache.set(name, loadedModule);
  const source = readFileSync(
    new URL(`../app/lib/${name}.ts`, import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (path) =>
      path.startsWith("./") ? load(path.slice(2)) : nativeRequire(path),
    loadedModule,
    loadedModule.exports,
  );
  return loadedModule.exports;
}
const { LocalOperations } = load("local-operations");
const { billingDeadline, gradeCode, onlineLessonState } =
  load("learning-store");
const { recommendationRank } = load("course-checkout");
async function setup() {
  const f = fixture();
  let clock = new Date("2099-02-01T00:00:00Z");

  f.insert("students", {
    id: "student",
    code: "student",
    name: "Test Student",
    email: "student@example.test",
    level: "G4",
  });
  f.insert("student_profiles", { student_id: "student", school_system: "sjk" });
  f.insert("student_registrations", {
    id: "registration",
    student_id: "student",
    status: "accepted",
  });
  f.insert("student_memberships", {
    student_id: "student",
    status: "active",
    valid_until: "2100-12-31",
  });
  f.insert("pass_products", {
    id: "pass-monthly",
    code: "MONTHLY",
    name: "Monthly plan",
    price: 160,
    onsite_credits: 4,
    online_credits: 6,
    study_credits: 2,
    validity_type: "calendar_month",
    issuance_mode: "tickets",
    status: "active",
  });
  for (const [type, price] of [
    ["onsite", 25],
    ["online", 15],
    ["study", 5],
  ])
    f.insert("pass_products", {
      id: `single-${type}`,
      code: `S-${type}`,
      name: type,
      price,
      unit_price: price,
      [`${type}_credits`]: 1,
      status: "active",
    });
  for (const [id, start] of [
    ["feb1", "2099-02-10 10:00"],
    ["feb2", "2099-02-17 10:00"],
    ["march", "2099-03-10 10:00"],
    ["replacement", "2099-04-10 10:00"],
  ])
    f.insert("class_sessions", {
      id,
      class_run_id: "run-primary",
      session_no:
        id === "feb1" ? 1 : id === "feb2" ? 2 : id === "march" ? 3 : 4,
      topic: id,
      starts_at: start,
      ends_at: start.slice(0, 11) + "11:00",
      status: "scheduled",
      online_url: "https://classroom.example.test/lesson",
    });
  // Replacement is an independently scheduled run, excluded from initial enrollment.
  f.insert("class_runs", {
    id: "makeup-run",
    code: "MAKEUP",
    course_id: "primary",
    term_id: "term",
    name: "Makeup group",
    capacity: 16,
    status: "open",
  });
  f.db.exec(
    "UPDATE class_sessions SET class_run_id='makeup-run' WHERE id='replacement'",
  );
  const ops = new LocalOperations(f.adapter, () => clock);
  await ops.learning.prepareLegacySchema();
  f.db.exec(
    "INSERT OR IGNORE INTO app_settings(key,value) VALUES ('portal_runtime_ready_v2','1')",
  );
  const plan = {
    studentId: "student",
    runId: "run-primary",
    deliveryMode: "onsite",
    serviceMonth: "2099-02",
    amount: 50,
    onsiteCredits: 2,
    onlineCredits: 6,
    studyCredits: 2,
    dueAt: "2099-02-05",
    note: "Campus-approved first month",
    requestKey: "first-plan-001",
  };
  const payment = (orderId) => ({
    orderId,
    receivedAmount: 50,
    method: "bank_transfer",
    reference: "BANK-2099-001",
    receivedAt: "2099-02-01T07:00",
    note: "Verified bank receipt",
    requestKey: `payment-${orderId}`,
  });
  return {
    ...f,
    ops,
    plan,
    payment,
    setNow(value) {
      clock = new Date(value);
    },
    row(sql, ...values) {
      return f.db.prepare(sql).get(...values);
    },
  };
}

test("manual first-month plan, explicit receipt, duplicate request, and scoped snapshot are consistent", async () => {
  const f = await setup();
  try {
    await assert.rejects(f.ops.assertSelfService("student"), /first-month/);
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    assert.equal(
      f.row("SELECT total_amount FROM pass_orders WHERE id=?", orderId)
        .total_amount,
      50,
    );
    assert.equal(
      f.row("SELECT COUNT(*) n FROM course_seat_holds WHERE status='held'").n,
      3,
    );
    assert.equal(
      f.row(
        "SELECT original_amount_cents FROM pass_order_controls WHERE order_id=?",
        orderId,
      ).original_amount_cents,
      12000,
    );
    await f.ops.assertSelfService("student");
    const receipt = await f.ops.confirmPayment(f.payment(orderId), f.admin);
    await f.ops.confirmPayment(f.payment(orderId), f.admin);
    assert.equal(receipt.receipt.amount_cents, 5000);
    assert.equal(f.row("SELECT COUNT(*) n FROM course_payment_receipts").n, 1);
    assert.equal(
      f.row(
        "SELECT COUNT(*) n FROM learning_credit_events WHERE status='reserved'",
      ).n,
      2,
    );
    const snapshot = await f.ops.snapshot({
      ...f.admin,
      role: "student",
      student_id: "student",
    });
    assert.equal(snapshot.orders[0].student_id, "student");
    assert.deepEqual(snapshot.events, []);
    assert.equal(
      snapshot.orders.find((o) => o.id === orderId).receipt_amount_cents,
      5000,
    );
    await assert.rejects(
      f.ops.confirmPayment(
        { ...f.payment(orderId), receivedAmount: 99 },
        f.admin,
      ),
      /different details/,
    );
  } finally {
    f.close();
  }
});

test("zero-price waiver is explicit, and wrong amount or missing transfer proof cannot issue tickets", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    await assert.rejects(
      f.ops.confirmPayment(
        { ...f.payment(orderId), receivedAmount: 49 },
        f.admin,
      ),
      /remaining balance/,
    );
    await assert.rejects(
      f.ops.confirmPayment({ ...f.payment(orderId), reference: "" }, f.admin),
      /reference/,
    );
    await f.ops.adjustOrder(
      {
        orderId,
        amount: 0,
        dueAt: "",
        note: "Approved first-month waiver",
        requestKey: "waiver-adjustment",
      },
      f.admin,
    );
    await assert.rejects(
      f.ops.confirmPayment(
        { ...f.payment(orderId), receivedAmount: 0 },
        f.admin,
      ),
      /fee waiver/,
    );
    await f.ops.confirmPayment(
      { ...f.payment(orderId), receivedAmount: 0, method: "fee_waiver" },
      f.admin,
    );
    assert.equal(
      f.row("SELECT amount_cents,method FROM course_payment_receipts").method,
      "fee_waiver",
    );
    assert.equal(
      f.row("SELECT COUNT(*) n FROM student_passes WHERE status='active'").n,
      10,
    );
  } finally {
    f.close();
  }
});

test("receipt records the remaining amount of a historical partial payment", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    f.db
      .prepare("UPDATE pass_orders SET paid_amount=20 WHERE id=?")
      .run(orderId);
    await f.ops.confirmPayment(
      { ...f.payment(orderId), receivedAmount: 30 },
      f.admin,
    );
    const order = (await f.ops.snapshot(f.admin)).orders.find(
      (o) => o.id === orderId,
    );
    assert.equal(order.amount_cents, 5000);
    assert.equal(order.receipt_amount_cents, 3000);
    assert.equal(order.paid_amount, 50);
    assert.equal(f.row("SELECT amount FROM pass_payments").amount, 30);
  } finally {
    f.close();
  }
});

test("overdue release is idempotent; late payment atomically restores available seats", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    f.setNow("2099-02-06T00:00:00Z");
    assert.equal((await f.ops.releaseOverdue()).released, 2);
    assert.equal((await f.ops.releaseOverdue()).released, 0);
    assert.equal(
      f.row(
        "SELECT COUNT(*) n FROM class_student_bookings WHERE status='booked'",
      ).n,
      1,
    );
    await f.ops.confirmPayment(f.payment(orderId), f.admin);
    assert.equal(
      f.row(
        "SELECT COUNT(*) n FROM class_student_bookings WHERE status='booked'",
      ).n,
      3,
    );
    assert.equal(
      f.row("SELECT COUNT(*) n FROM course_seat_holds WHERE status='confirmed'")
        .n,
      2,
    );
    assert.equal(
      f.row(
        "SELECT COUNT(*) n FROM learning_credit_events WHERE status='reserved'",
      ).n,
      2,
    );
  } finally {
    f.close();
  }
});

test("late payment cannot reclaim a seat that another learner has taken", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    f.setNow("2099-02-06T00:00:00Z");
    await f.ops.releaseOverdue();
    f.db.exec("UPDATE class_runs SET capacity=1 WHERE id='run-primary'");
    f.insert("students", { id: "other", code: "OTHER", name: "Other" });
    f.insert("class_enrollments", {
      id: "other-e",
      student_id: "other",
      class_run_id: "run-primary",
      status: "enrolled",
    });
    f.insert("class_student_bookings", {
      id: "other-b",
      student_id: "other",
      class_session_id: "feb1",
      enrollment_id: "other-e",
      status: "booked",
      delivery_mode: "onsite",
    });
    await assert.rejects(
      f.ops.confirmPayment(f.payment(orderId), f.admin),
      /full|overlaps/,
    );
    assert.equal(
      f.row("SELECT status FROM pass_orders WHERE id=?", orderId).status,
      "unpaid",
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM course_payment_receipts").n, 0);
  } finally {
    f.close();
  }
});

test("extending before release preserves held seats, and an unset deadline never auto-releases", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    await f.ops.extendHold(
      {
        orderId,
        deadline: "2099-02-09",
        note: "Approved extension",
        requestKey: "extend-deadline-1",
      },
      f.admin,
    );
    f.setNow("2099-02-06T00:00:00Z");
    assert.equal((await f.ops.releaseOverdue()).released, 0);
    const march = f.row(
      "SELECT id,due_at FROM pass_orders WHERE billing_month='2099-03'",
    );
    assert.equal(march.due_at, "");
    f.setNow("2099-03-01T00:00:00Z");
    assert.equal((await f.ops.releaseOverdue()).released, 0);
  } finally {
    f.close();
  }
});

test("payment transaction interruption rolls back receipt, payment, tickets, and audit event together", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    f.interrupt(8);
    await assert.rejects(
      f.ops.confirmPayment(f.payment(orderId), f.admin),
      /Injected/,
    );
    assert.equal(
      f.row("SELECT status FROM pass_orders WHERE id=?", orderId).status,
      "unpaid",
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM course_payment_receipts").n, 0);
    assert.equal(
      f.row("SELECT COUNT(*) n FROM student_passes WHERE status='active'").n,
      0,
    );
    assert.equal(
      f.row(
        "SELECT COUNT(*) n FROM operating_events WHERE action='confirmCoursePayment'",
      ).n,
      0,
    );
    f.interrupt(null);
    await f.ops.confirmPayment(f.payment(orderId), f.admin);
    assert.equal(f.row("SELECT COUNT(*) n FROM course_payment_receipts").n, 1);
  } finally {
    f.close();
  }
});

test("campus cancellation transfers a paid right to a specific cross-month makeup exactly once", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    await f.ops.confirmPayment(f.payment(orderId), f.admin);
    const old = f.row(
      "SELECT * FROM learning_credit_events WHERE booking_id='student:feb1'",
    );
    f.db.exec("UPDATE class_sessions SET status='cancelled' WHERE id='feb1'");
    assert.equal(
      f.row(
        "SELECT release_reason FROM course_seat_holds WHERE booking_id='student:feb1'",
      ).release_reason,
      "campus_cancelled",
    );
    const input = {
      originalSessionId: "feb1",
      targetSessionId: "replacement",
      studentIds: ["student"],
      note: "Campus closure; approved makeup",
      requestKey: "campus-makeup-001",
    };
    await f.ops.scheduleMakeup(input, f.admin);
    await f.ops.scheduleMakeup(input, f.admin);
    assert.equal(f.row("SELECT COUNT(*) n FROM campus_makeups").n, 1);
    assert.equal(
      f.row(
        "SELECT onsite_remaining FROM student_passes WHERE id=?",
        old.pass_id,
      ).onsite_remaining,
      0,
    );
    const replacement = f.row(
      "SELECT p.* FROM student_passes p JOIN campus_makeups m ON m.compensation_pass_id=p.id",
    );
    assert.equal(replacement.valid_from, "2099-04-10");
    assert.equal(replacement.valid_until, "2099-04-10");
    assert.equal(
      f.row(
        "SELECT COUNT(*) n FROM learning_credit_history WHERE status='transferred_to_makeup'",
      ).n,
      1,
    );
    f.setNow("2099-04-10T02:15:00Z");
    await f.ops.learning.markAttendance("student:replacement", "present");
    assert.equal(
      f.row(
        "SELECT onsite_remaining FROM student_passes WHERE id=?",
        replacement.id,
      ).onsite_remaining,
      0,
    );
    f.setNow("2099-02-01T00:00:00Z");
    await assert.rejects(
      f.ops.scheduleMakeup(
        { ...input, requestKey: "campus-makeup-002" },
        f.admin,
      ),
      /already has/,
    );
  } finally {
    f.close();
  }
});

test("personal cancellation before campus closure does not earn another makeup", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    await f.ops.confirmPayment(f.payment(orderId), f.admin);
    await f.ops.learning.cancelLesson("student", "feb1");
    assert.equal(
      f.row(
        "SELECT release_reason FROM course_seat_holds WHERE booking_id='student:feb1'",
      ).release_reason,
      "student_cancelled",
    );
    f.db.exec("UPDATE class_sessions SET status='cancelled' WHERE id='feb1'");
    await assert.rejects(
      f.ops.scheduleMakeup(
        {
          originalSessionId: "feb1",
          targetSessionId: "replacement",
          studentIds: ["student"],
          note: "Review cancellation",
          requestKey: "personal-makeup-001",
        },
        f.admin,
      ),
      /already withdrawn/,
    );
  } finally {
    f.close();
  }
});

test("administrator mode conversion retains original ticket or explicitly takes one target ticket", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    await f.ops.confirmPayment(f.payment(orderId), f.admin);
    await f.ops.convertBooking(
      {
        bookingId: "student:feb1",
        deliveryMode: "online",
        creditPolicy: "keep_original",
        note: "Approved unchanged ticket",
        requestKey: "mode-change-001",
      },
      f.admin,
    );
    assert.equal(
      f.row(
        "SELECT credit_type FROM learning_credit_events WHERE booking_id='student:feb1'",
      ).credit_type,
      "onsite",
    );
    await f.ops.convertBooking(
      {
        bookingId: "student:feb2",
        deliveryMode: "online",
        creditPolicy: "use_target_credit",
        note: "One online ticket approved",
        requestKey: "mode-change-002",
      },
      f.admin,
    );
    assert.equal(
      f.row(
        "SELECT credit_type FROM learning_credit_events WHERE booking_id='student:feb2'",
      ).credit_type,
      "online",
    );
    f.setNow("2099-02-10T01:50:00Z");
    await f.ops.learning.joinOnline("student", "feb1");
    assert.equal(
      f.row(
        "SELECT status FROM learning_credit_events WHERE booking_id='student:feb1'",
      ).status,
      "consumed",
    );
  } finally {
    f.close();
  }
});

test("new monthly sales use calendar months while an already sold snapshot stays rolling", async () => {
  const f = await setup();
  try {
    f.db.exec(
      "UPDATE pass_products SET validity_type='rolling_days' WHERE id='pass-monthly'",
    );
    const orderId = await f.ops.learning.createPassOrder({
      studentId: "student",
      productId: "pass-monthly",
      requestKey: "new-calendar-order",
      months: 1,
      start: "2099-02-15",
    });
    const order = f.row(
      "SELECT offer_snapshot FROM pass_orders WHERE id=?",
      orderId,
    );
    const snapshot = JSON.parse(order.offer_snapshot);
    assert.equal(snapshot.windows[0].from, "2099-02-01");
    assert.equal(snapshot.windows[0].until, "2099-02-28");
    // Simulate a historical sold rolling snapshot without rewriting it during a later sale.
    snapshot.windows = [{ from: "2099-02-15", until: "2099-03-16" }];
    snapshot.product.validity_type = "rolling_days";
    f.db
      .prepare("UPDATE pass_orders SET offer_snapshot=? WHERE id=?")
      .run(JSON.stringify(snapshot), orderId);
    await f.ops.learning.createPassOrder({
      studentId: "student",
      productId: "pass-monthly",
      requestKey: "another-calendar-order",
      months: 1,
      start: "2099-03-15",
    });
    assert.equal(
      JSON.parse(
        f.row("SELECT offer_snapshot FROM pass_orders WHERE id=?", orderId)
          .offer_snapshot,
      ).windows[0].until,
      "2099-03-16",
    );
  } finally {
    f.close();
  }
});

test("rules, school grade matching, and hidden online-link state use explicit values", async () => {
  assert.equal(billingDeadline("2100-02", "2100-01-01", 31), "2100-02-28");
  assert.equal(billingDeadline("2099-02", "2099-02-01"), "");
  for (const code of ["J1", "J3", "S1", "S3", "F6"])
    assert.equal(gradeCode(code), code);
  assert.equal(
    recommendationRank(
      { level: "J1" },
      { course_level: "J1", course_title: "F1 wrongly named" },
    ),
    1,
  );
  assert.notEqual(
    onlineLessonState(
      {
        starts_at: "2099-02-01 08:00",
        ends_at: "2099-02-01 09:00",
        online_url_configured: true,
        status: "scheduled",
      },
      new Date("2099-02-01T00:15:00Z").getTime(),
    ),
    "link_pending",
  );
  const f = await setup();
  try {
    await f.ops.saveRules(
      {
        monthlyDueDay: 31,
        firstMonthManual: false,
        bankName: "Local Bank",
        bankAccountName: "Campus",
        bankAccountNumber: "1234",
        walletInstructions: "Use campus QR",
        requestKey: "operating-rule-001",
      },
      f.admin,
    );
    assert.equal((await f.ops.snapshot(f.admin)).firstMonthRequired.length, 0);
    await f.ops.assertSelfService("student");
    await assert.rejects(
      f.ops.saveRules({}, { ...f.admin, role: "student" }),
      /administrator/,
    );
  } finally {
    f.close();
  }
});

test("custom first-month quantities suggest their exact unit total; future 4/6/2 month stays RM160", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(
      {
        ...f.plan,
        onsiteCredits: 3,
        onlineCredits: 2,
        studyCredits: 1,
        amount: 80,
      },
      f.admin,
    );
    const control = f.row(
      "SELECT original_amount_cents FROM pass_order_controls WHERE order_id=?",
      orderId,
    );
    assert.equal(control.original_amount_cents, 9000);
    await f.ops.confirmPayment(
      { ...f.payment(orderId), receivedAmount: 80 },
      f.admin,
    );
    const counts = f.db
      .prepare(
        "SELECT credit_type,COUNT(*) n FROM student_passes WHERE order_id=? AND status='active' GROUP BY credit_type ORDER BY credit_type",
      )
      .all(orderId);
    assert.deepEqual(
      counts.map((v) => [v.credit_type, v.n]),
      [
        ["online", 2],
        ["onsite", 3],
        ["study", 1],
      ],
    );
    const future = f.row(
      "SELECT total_amount,offer_snapshot FROM pass_orders WHERE billing_month='2099-03'",
    );
    const snapshot = JSON.parse(future.offer_snapshot);
    assert.equal(future.total_amount, 160);
    assert.deepEqual(
      [
        snapshot.product.onsite_credits,
        snapshot.product.online_credits,
        snapshot.product.study_credits,
      ],
      [4, 6, 2],
    );
    assert.equal(
      f.row(
        "SELECT COUNT(*) n FROM student_passes WHERE order_id=? AND status='active' AND valid_until!='2099-02-28'",
        orderId,
      ).n,
      0,
    );
    f.setNow("2099-03-01T00:00:00Z");
    await assert.rejects(
      f.ops.learning.reserveCredit(
        "student",
        "study",
        "2099-03-01",
        "expired-first-month",
      ),
      /No study credit/,
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM course_payment_receipts").n, 1);
  } finally {
    f.close();
  }
});

test("manual quota cannot underfund selected first-month lessons and rejects before writing", async () => {
  const f = await setup();
  try {
    await assert.rejects(
      f.ops.createManualCoursePlan({ ...f.plan, onsiteCredits: 1 }, f.admin),
      /at least 2 onsite/,
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM pass_orders").n, 0);
    assert.equal(f.row("SELECT COUNT(*) n FROM operating_events").n, 0);
  } finally {
    f.close();
  }
});

test("a competing order adjustment prevents stale payment from recording the old amount", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    f.beforeBatch(() => {
      f.db
        .prepare(
          "UPDATE pass_order_controls SET revision=revision+1 WHERE order_id=?",
        )
        .run(orderId);
      f.db
        .prepare("UPDATE pass_orders SET total_amount=60 WHERE id=?")
        .run(orderId);
    });
    await assert.rejects(
      f.ops.confirmPayment(f.payment(orderId), f.admin),
      /constraint/,
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM course_payment_receipts").n, 0);
    assert.equal(
      f.row("SELECT status FROM pass_orders WHERE id=?", orderId).status,
      "unpaid",
    );
  } finally {
    f.close();
  }
});

test("a competing class cancellation cannot be undone by a late payment restoration", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    f.setNow("2099-02-06T00:00:00Z");
    await f.ops.releaseOverdue();
    f.beforeBatch(() =>
      f.db.exec("UPDATE class_sessions SET status='cancelled' WHERE id='feb1'"),
    );
    await assert.rejects(
      f.ops.confirmPayment(f.payment(orderId), f.admin),
      /constraint/,
    );
    assert.equal(
      f.row("SELECT status FROM class_student_bookings WHERE id='student:feb1'")
        .status,
      "cancelled",
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM course_payment_receipts").n, 0);
  } finally {
    f.close();
  }
});

test("standalone ticket order without a class issues 4/6/2 tickets and an actual receipt after review", async () => {
  const f = await setup();
  try {
    const orderId = await f.ops.learning.createPassOrder({
      studentId: "student",
      productId: "pass-monthly",
      requestKey: "standalone-pass-order",
      months: 1,
      start: "2099-02-01",
    });
    assert.equal(
      f.row("SELECT selected_run_id FROM pass_orders WHERE id=?", orderId)
        .selected_run_id,
      null,
    );
    await assert.rejects(
      f.ops.confirmPayment(
        { ...f.payment(orderId), receivedAmount: 160 },
        f.admin,
      ),
      /Review and approve/,
    );
    await f.ops.adjustOrder(
      {
        orderId,
        amount: 160,
        dueAt: "",
        note: "Approved full first-month pass at 4/6/2",
        requestKey: "approve-standalone",
      },
      f.admin,
    );
    await f.ops.confirmPayment(
      { ...f.payment(orderId), receivedAmount: 160 },
      f.admin,
    );
    const counts = f.db
      .prepare(
        "SELECT credit_type,COUNT(*) n FROM student_passes WHERE order_id=? AND status='active' GROUP BY credit_type ORDER BY credit_type",
      )
      .all(orderId);
    assert.deepEqual(
      counts.map((v) => [v.credit_type, v.n]),
      [
        ["online", 6],
        ["onsite", 4],
        ["study", 2],
      ],
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM class_student_bookings").n, 0);
    assert.equal(
      f.row("SELECT amount_cents FROM course_payment_receipts").amount_cents,
      16000,
    );
  } finally {
    f.close();
  }
});

test("an administrator can explicitly choose one first-month lesson and issue a smaller plan", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(
      {
        ...f.plan,
        sessionIds: ["feb2"],
        onsiteCredits: 1,
        onlineCredits: 1,
        studyCredits: 0,
        amount: 30,
        reserveFuture: false,
      },
      f.admin,
    );
    await f.ops.confirmPayment(
      { ...f.payment(orderId), receivedAmount: 30 },
      f.admin,
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM class_student_bookings").n, 1);
    assert.equal(
      f.row("SELECT class_session_id FROM class_student_bookings")
        .class_session_id,
      "feb2",
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM pass_orders").n, 1);
    assert.equal(
      f.row("SELECT COUNT(*) n FROM student_passes WHERE status='active'").n,
      2,
    );
  } finally {
    f.close();
  }
});

test("an explicit empty first-month selection can issue only online and study tickets without reserving a class", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(
      {
        ...f.plan,
        sessionIds: [],
        onsiteCredits: 0,
        onlineCredits: 2,
        studyCredits: 1,
        amount: 30,
        reserveFuture: false,
      },
      f.admin,
    );
    await f.ops.confirmPayment(
      { ...f.payment(orderId), receivedAmount: 30 },
      f.admin,
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM class_student_bookings").n, 0);
    assert.equal(f.row("SELECT COUNT(*) n FROM course_seat_holds").n, 0);
    assert.equal(
      f.row("SELECT COUNT(*) n FROM student_passes WHERE status='active'").n,
      3,
    );
  } finally {
    f.close();
  }
});

test("a manual online first month still quotes a normal 4/6/2 package for the next whole month", async () => {
  const f = await setup();
  try {
    await f.ops.createManualCoursePlan(
      {
        ...f.plan,
        deliveryMode: "online",
        onsiteCredits: 0,
        onlineCredits: 2,
        studyCredits: 1,
        amount: 30,
      },
      f.admin,
    );
    const next = f.row(
      "SELECT total_amount,offer_snapshot FROM pass_orders WHERE billing_month='2099-03'",
    );
    const snapshot = JSON.parse(next.offer_snapshot);
    assert.equal(next.total_amount, 160);
    assert.deepEqual(
      [
        snapshot.product.onsite_credits,
        snapshot.product.online_credits,
        snapshot.product.study_credits,
      ],
      [4, 6, 2],
    );
  } finally {
    f.close();
  }
});

test("future month extras require explicit agreement and issue the extra selected lesson ticket", async () => {
  const f = await setup();
  try {
    for (let index = 1; index <= 4; index++)
      f.insert("class_sessions", {
        id: `extra-${index}`,
        class_run_id: "run-primary",
        session_no: 10 + index,
        topic: "Future extra",
        starts_at: `2099-03-${String(10 + index).padStart(2, "0")} 10:00`,
        ends_at: `2099-03-${String(10 + index).padStart(2, "0")} 11:00`,
        status: "scheduled",
      });
    await assert.rejects(
      f.ops.createManualCoursePlan(f.plan, f.admin),
      /Explicitly approve the extra/,
    );
    assert.equal(f.row("SELECT COUNT(*) n FROM pass_orders").n, 0);
    await f.ops.createManualCoursePlan(
      { ...f.plan, includeExtra: true },
      f.admin,
    );
    const next = f.row(
      "SELECT id,total_amount,offer_snapshot FROM pass_orders WHERE billing_month='2099-03'",
    );
    const snapshot = JSON.parse(next.offer_snapshot);
    assert.equal(next.total_amount, 180);
    assert.equal(snapshot.product.onsite_credits, 5);
    await f.ops.confirmPayment(
      { ...f.payment(next.id), receivedAmount: 180 },
      f.admin,
    );
    assert.equal(
      f.row(
        "SELECT COUNT(*) n FROM learning_credit_events WHERE service_date LIKE '2099-03-%' AND status='reserved'",
      ).n,
      5,
    );
  } finally {
    f.close();
  }
});

test("paying a bill never restores a personally cancelled seat, while admin-release seats can be rebooked", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    await f.ops.learning.cancelLesson("student", "feb1");
    assert.equal(
      f.row(
        "SELECT release_reason FROM course_seat_holds WHERE booking_id='student:feb1'",
      ).release_reason,
      "student_cancelled",
    );
    await f.ops.releaseHold(
      {
        orderId,
        note: "Manual temporary hold release",
        requestKey: "release-admin-001",
      },
      f.admin,
    );
    assert.equal(
      f.row(
        "SELECT release_reason FROM course_seat_holds WHERE booking_id='student:feb2'",
      ).release_reason,
      "administrator",
    );
    await f.ops.confirmPayment(f.payment(orderId), f.admin);
    assert.equal(
      f.row("SELECT status FROM class_student_bookings WHERE id='student:feb1'")
        .status,
      "cancelled",
    );
    assert.equal(
      f.row("SELECT status FROM class_student_bookings WHERE id='student:feb2'")
        .status,
      "booked",
    );
    assert.equal(
      f.row(
        "SELECT status FROM course_seat_holds WHERE booking_id='student:feb1'",
      ).status,
      "released",
    );
  } finally {
    f.close();
  }
});

test("hold lifecycle migration repairs older cancelled rows and leaves overdue reasons restorable", async () => {
  const f = await setup();
  try {
    const { orderId } = await f.ops.createManualCoursePlan(f.plan, f.admin);
    f.db.exec("DROP TRIGGER course_hold_booking_cancelled");
    await f.ops.learning.cancelLesson("student", "feb1");
    assert.equal(
      f.row(
        "SELECT status FROM course_seat_holds WHERE booking_id='student:feb1'",
      ).status,
      "held",
    );
    f.setNow("2099-02-06T00:00:00Z");
    await f.ops.releaseOverdue();
    f.db.exec(
      readFileSync(
        new URL("../drizzle/0033_hold_lifecycle.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(
      f.row(
        "SELECT release_reason FROM course_seat_holds WHERE booking_id='student:feb1'",
      ).release_reason,
      "student_cancelled",
    );
    assert.equal(
      f.row(
        "SELECT release_reason FROM course_seat_holds WHERE booking_id='student:feb2'",
      ).release_reason,
      "overdue",
    );
    await f.ops.confirmPayment(f.payment(orderId), f.admin);
    assert.equal(
      f.row("SELECT status FROM class_student_bookings WHERE id='student:feb1'")
        .status,
      "cancelled",
    );
    assert.equal(
      f.row("SELECT status FROM class_student_bookings WHERE id='student:feb2'")
        .status,
      "booked",
    );
  } finally {
    f.close();
  }
});
