import assert from "node:assert/strict";
import test from "node:test";
import { fixture, load, registration } from "./workflow-fixture.mjs";
const { BusinessWorkflow, validateRegistration } =
  await load("business-workflow");
const { PortalAuth, passwordHash, verifyPassword, checkOrigin } =
  await load("portal-auth");
const { authorizePortalAction, scopePortalData } = await load("portal-access");
const { academicStage, stageReason, defaultBookingPolicy } =
  await load("booking-policy");
async function accepted(f) {
  const service = new BusinessWorkflow(f.adapter);
  const r = await service.submitRegistration(registration);
  await service.reviewRegistration(
    { registrationId: r.registrationId, status: "accepted" },
    f.admin,
  );
  return { service, ...r };
}
async function paid(f) {
  const s = await accepted(f);
  await s.service.issueMembershipInvoice({
    studentId: s.studentId,
    amount: "25.50",
    requestKey: "membership-issue",
  });
  const invoice = f.db.prepare("SELECT * FROM membership_invoices").get();
  await s.service.confirmMembershipPayment(
    {
      membershipInvoiceId: invoice.id,
      method: "bank_transfer",
      reference: "TEST",
    },
    f.admin,
  );
  return { ...s, invoice };
}

test('anonymous registration cannot claim an existing student by supplying its ID', async () => {
  const f = fixture();
  try {
    const {service,studentId} = await accepted(f);
    await assert.rejects(service.submitRegistration({...registration,studentId,email:'attacker@example.test',fullName:'Replacement'}), /linked by the campus/);
    assert.equal(f.db.prepare('SELECT name FROM students WHERE id=?').get(studentId).name,registration.fullName);
  } finally { f.close(); }
});

test('students cannot use purchasePass payNow to confirm a payment', async () => {
  const f = fixture();
  try {
    for (const payNow of [true,'true']) await assert.rejects(authorizePortalAction(f.adapter,{...f.admin,role:'student',student_id:'student'},{action:'purchasePass',payNow}), /campus can confirm/);
    await authorizePortalAction(f.adapter,{...f.admin,role:'student',student_id:'student'},{action:'purchasePass',payNow:false});
  } finally { f.close(); }
});

test('admin full-profile edits synchronise school, login and guardian while preserving admission', async () => {
  const f = fixture();
  try {
    const {service,studentId} = await accepted(f);
    f.insert('portal_accounts',{id:'profile-account',email:registration.email,password_hash:'test-only',display_name:registration.fullName,role:'student',student_id:studentId});
    await service.updateStudentProfile({...registration,studentId,fullName:'Updated student',email:'updated@example.test',schoolSystem:'smk',level:'F6',guardianPhone:'+60123456789'},f.admin);
    assert.equal(f.db.prepare('SELECT status FROM student_registrations WHERE student_id=?').get(studentId).status,'accepted');
    assert.equal(f.db.prepare('SELECT email FROM portal_accounts WHERE student_id=?').get(studentId).email,'updated@example.test');
    assert.equal(f.db.prepare('SELECT school_system FROM student_profiles WHERE student_id=?').get(studentId).school_system,'smk');
    assert.equal(f.db.prepare('SELECT level FROM students WHERE id=?').get(studentId).level,'F6');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM student_profile_history').get().n,1);
    await assert.rejects(service.updateStudentProfile({...registration,studentId},{...f.admin,role:'student',student_id:studentId}), /Only the campus/);
  } finally { f.close(); }
});
test("registration validates required PDF fields, school context, real dates and contacts", () => {
  for (const field of [
    "fullName",
    "gender",
    "enrollmentDate",
    "email",
    "studentPhone",
    "preferredLanguage",
    "schoolName",
    "schoolSystem",
    "level",
    "guardianName",
    "relationship",
    "guardianPhone",
    "guardianGender",
  ])
    assert.throws(
      () => validateRegistration({ ...registration, [field]: "" }),
      (error) => Boolean(error.fields[field]),
    );
  assert.throws(() =>
    validateRegistration({ ...registration, dateOfBirth: "2025-02-29" }),
  );
  assert.throws(() =>
    validateRegistration({ ...registration, schoolSystem: "smk", level: "G6" }),
  );
  assert.equal(
    validateRegistration({ ...registration, email: "UPPER@EXAMPLE.TEST" })
      .email,
    "upper@example.test",
  );
});
test("registration retry preserves one applicant; acceptance queues exactly one welcome and orientation task", async () => {
  const f = fixture();
  try {
    const service = new BusinessWorkflow(f.adapter);
    const r = await service.submitRegistration(registration);
    await service.reviewRegistration(
      {
        registrationId: r.registrationId,
        status: "needs_changes",
        note: "Please correct guardian phone",
      },
      f.admin,
    );
    const actor = {
      ...f.admin,
      role: "student",
      student_id: r.studentId,
      email: registration.email,
    };
    await service.submitRegistration(
      { ...registration, guardianPhone: "+60111111111" },
      actor,
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM students").get().n, 1);
    await service.reviewRegistration(
      { registrationId: r.registrationId, status: "accepted" },
      f.admin,
    );
    await service.reviewRegistration(
      { registrationId: r.registrationId, status: "accepted" },
      f.admin,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM notification_outbox").get().n,
      1,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM onboarding_tasks").get().n,
      1,
    );
    assert.equal(
      f.db.prepare("SELECT status FROM notification_outbox").get().status,
      "pending",
    );
    await assert.rejects(
      service.submitRegistration(registration, actor),
      /closed/,
    );
    await assert.rejects(
      service.assertBooking(r.studentId, "run-primary"),
      /membership payment/,
    );
  } finally {
    f.close();
  }
});
test("invoice, receipt, membership activation and admission ticket are atomic and retry-safe", async () => {
  const f = fixture();
  try {
    const s = await paid(f);
    await s.service.issueMembershipInvoice({
      studentId: s.studentId,
      amount: "25.50",
      requestKey: "membership-issue",
    });
    await s.service.confirmMembershipPayment(
      { membershipInvoiceId: s.invoice.id, method: "bank_transfer" },
      f.admin,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM membership_receipts").get().n,
      1,
    );
    assert.equal(
      f.db.prepare("SELECT amount_cents FROM membership_receipts").get()
        .amount_cents,
      2550,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM membership_access_passes").get().n,
      1,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM student_passes").get().n,
      0,
    );
    await s.service.assertBooking(s.studentId, "run-primary");
    await assert.rejects(
      s.service.assertBooking(s.studentId, "run-secondary"),
      /G6 exceptions/,
    );
    await s.service.savePolicy({ g6SecondaryCourseIds: ["secondary"] });
    await s.service.assertBooking(s.studentId, "run-secondary");
    await assert.rejects(
      s.service.savePolicy({ g6SecondaryCourseIds: ["primary"] }),
    );
    f.db
      .prepare("UPDATE class_runs SET status='draft' WHERE id='run-secondary'")
      .run();
    await assert.rejects(
      s.service.assertBooking(s.studentId, "run-secondary"),
      /not been published/,
    );
  } finally {
    f.close();
  }
});
test("payment interruption rolls back every financial effect", async () => {
  const f = fixture();
  try {
    const s = await accepted(f);
    await s.service.issueMembershipInvoice({
      studentId: s.studentId,
      amount: 10,
      requestKey: "atomic-membership",
    });
    const invoice = f.db.prepare("SELECT * FROM membership_invoices").get();
    f.interrupt(2);
    await assert.rejects(
      s.service.confirmMembershipPayment(
        { membershipInvoiceId: invoice.id, method: "cash" },
        f.admin,
      ),
      /Injected/,
    );
    assert.equal(
      f.db.prepare("SELECT status FROM membership_invoices").get().status,
      "unpaid",
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM membership_receipts").get().n,
      0,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM membership_access_passes").get().n,
      0,
    );
  } finally {
    f.close();
  }
});
test("membership amount and waiver rules reject ambiguous or invalid invoices", async () => {
  const f = fixture();
  try {
    const s = await accepted(f);
    for (const amount of [-1, "abc", 1.001, 1000001])
      await assert.rejects(
        s.service.issueMembershipInvoice({
          studentId: s.studentId,
          amount,
          requestKey: "invalid-amount",
        }),
      );
    await assert.rejects(
      s.service.issueMembershipInvoice({
        studentId: s.studentId,
        amount: 0,
        requestKey: "zero-amount",
      }),
      /waiver/,
    );
    await s.service.issueMembershipInvoice({
      studentId: s.studentId,
      amount: 0,
      note: "Approved scholarship",
      requestKey: "waived-amount",
    });
    const invoice = f.db.prepare("SELECT id FROM membership_invoices").get();
    await assert.rejects(
      s.service.confirmMembershipPayment(
        { membershipInvoiceId: invoice.id, method: "cash" },
        f.admin,
      ),
      /waiver/,
    );
    await s.service.confirmMembershipPayment(
      { membershipInvoiceId: invoice.id, method: "fee_waiver" },
      f.admin,
    );
  } finally {
    f.close();
  }
});
test("expired membership and mismatched run/session cannot bypass booking restrictions", async () => {
  const f = fixture();
  try {
    const s = await paid(f);
    f.insert("class_sessions", {
      id: "lesson",
      class_run_id: "run-primary",
      starts_at: "2099-01-01 09:00",
      ends_at: "2099-01-01 10:00",
    });
    await assert.rejects(
      s.service.assertBooking(s.studentId, "run-secondary", "lesson"),
      /does not belong/,
    );
    f.db.exec("UPDATE student_memberships SET valid_until='2000-01-01'");
    await assert.rejects(
      s.service.assertBooking(s.studentId, "run-primary"),
      /expired/,
    );
  } finally {
    f.close();
  }
});
test("stage restrictions cover primary, secondary and explicit G6 exceptions", () => {
  assert.equal(academicStage({ level: "G6" }), "primary");
  assert.equal(academicStage({ level: "J2" }), "secondary");
  assert.ok(
    stageReason(
      { level: "G5" },
      { id: "x", level: "F1" },
      defaultBookingPolicy,
    ),
  );
  assert.equal(
    stageReason(
      { level: "G6" },
      { id: "x", level: "F1" },
      { ...defaultBookingPolicy, g6SecondaryCourseIds: ["x"] },
    ),
    "",
  );
  assert.ok(
    stageReason(
      { level: "F1" },
      { id: "p", level: "G4" },
      defaultBookingPolicy,
    ),
  );
});
test("authentication hashes passwords, scopes sessions and invalidates logout", async () => {
  const f = fixture();
  try {
    const service = new PortalAuth(f.adapter),
      request = new Request("http://localhost:3100/api/auth");
    const hash = await passwordHash("long-local-password");
    assert.ok(!hash.includes("long-local-password"));
    assert.equal(await verifyPassword("long-local-password", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
    const cookie = await service.bootstrap(
      {
        email: "admin@example.test",
        password: "long-local-password",
        name: "Administrator",
      },
      request,
    );
    assert.match(cookie, /HttpOnly; SameSite=Lax/);
    const signed = new Request(request, {
      headers: { Cookie: cookie.split(";")[0] },
    });
    assert.equal((await service.actor(signed)).role, "admin");
    await assert.rejects(
      service.actor(new Request(request, { headers: { "x-role": "admin" } })),
      (e) => e.status === 401,
    );
    await service.logout(signed);
    await assert.rejects(service.actor(signed), (e) => e.status === 401);
    await assert.rejects(
      service.bootstrap(
        {
          email: "other@example.test",
          password: "long-local-password",
          name: "Other",
        },
        request,
      ),
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM portal_accounts").get().n,
      1,
    );
  } finally {
    f.close();
  }
});
test("remote bootstrap needs server key, cross-site requests fail, and login attempts are limited", async () => {
  const f = fixture();
  try {
    const service = new PortalAuth(f.adapter),
      request = new Request("https://campus.example.test/api/auth");
    await assert.rejects(
      service.bootstrap(
        {
          email: "admin@example.test",
          password: "long-local-password",
          name: "A",
        },
        request,
      ),
      (e) => e.status === 403,
    );
    assert.throws(() =>
      checkOrigin(
        new Request(request, { headers: { Origin: "https://other.test" } }),
      ),
    );
    for (let i = 0; i < 10; i++)
      await assert.rejects(
        service.login("nobody@example.test", "wrong-password", request),
        (e) => e.status === 401,
      );
    await assert.rejects(
      service.login("nobody@example.test", "wrong-password", request),
      (e) => e.status === 429,
    );
  } finally {
    f.close();
  }
});
test("students cannot impersonate others or invoke administrator and school-stage actions", async () => {
  const f = fixture();
  try {
    const actor = { ...f.admin, role: "student", student_id: "self" };
    await assert.rejects(
      authorizePortalAction(f.adapter, actor, {
        action: "checkoutCourse",
        studentId: "other",
      }),
    );
    for (const action of [
      "confirmMembershipPayment",
      "reviewRegistration",
      "publishClassRun",
      "updateStudentSchool",
    ])
      await assert.rejects(authorizePortalAction(f.adapter, actor, { action }));
    const body = { action: "checkoutCourse" };
    await authorizePortalAction(f.adapter, actor, body);
    assert.equal(body.studentId, "self");
  } finally {
    f.close();
  }
});
test("student payloads hide other learners, their finances, staff compensation and mail settings", () => {
  const actor = { id: "u", role: "student", student_id: "self" };
  const rows = {
    students: [{ id: "self" }, { id: "other", email: "private" }],
    sessions: [{ id: "lesson", pay_amount: 100 }],
    bookings: [
      {
        id: "mine",
        student_id: "self",
        class_session_id: "lesson",
        status: "booked",
      },
      {
        id: "secret",
        student_id: "other",
        class_session_id: "lesson",
        status: "booked",
        delivery_mode: "onsite",
        enrollment_id: "private",
      },
    ],
    invoices: [
      { student_id: "self", total_amount: 10 },
      { student_id: "other", total_amount: 100 },
    ],
    courseLessons: [{ default_pay_amount: 50 }],
    settings: { mail: { password: "hidden" } },
  };
  const scoped = scopePortalData(rows, actor);
  assert.equal(scoped.students.length, 1);
  assert.equal(scoped.invoices.length, 1);
  assert.equal(scoped.bookings[1].student_id, "");
  assert.equal(scoped.bookings[1].enrollment_id, undefined);
  assert.equal(scoped.sessions[0].pay_amount, undefined);
  assert.equal(scoped.courseLessons[0].default_pay_amount, undefined);
  assert.deepEqual(scoped.settings.mail, {});
});
test("unpaid invoice correction allows replacement without inventing a payment", async () => {
  const f = fixture();
  try {
    const s = await accepted(f);
    await s.service.issueMembershipInvoice({
      studentId: s.studentId,
      amount: 30,
      requestKey: "incorrect-membership",
    });
    const invoice = f.db.prepare("SELECT id FROM membership_invoices").get();
    await s.service.cancelMembershipInvoice({
      membershipInvoiceId: invoice.id,
    });
    await s.service.issueMembershipInvoice({
      studentId: s.studentId,
      amount: 40,
      requestKey: "corrected-membership",
    });
    assert.equal(
      f.db
        .prepare(
          "SELECT amount_cents FROM membership_invoices WHERE status='unpaid'",
        )
        .get().amount_cents,
      4000,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM membership_receipts").get().n,
      0,
    );
    await assert.rejects(s.service.assertBooking(s.studentId, "run-primary"));
  } finally {
    f.close();
  }
});
test("a review racing another completed review cannot reopen or overwrite its outcome", async () => {
  const f = fixture();
  try {
    const service = new BusinessWorkflow(f.adapter),
      r = await service.submitRegistration(registration);
    f.beforeBatch(() =>
      f.db
        .prepare(
          "UPDATE student_registrations SET status='discarded' WHERE id=?",
        )
        .run(r.registrationId),
    );
    await assert.rejects(
      service.reviewRegistration(
        { registrationId: r.registrationId, status: "accepted" },
        f.admin,
      ),
      /closed/,
    );
    assert.equal(
      f.db.prepare("SELECT status FROM student_registrations").get().status,
      "discarded",
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM notification_outbox").get().n,
      0,
    );
  } finally {
    f.close();
  }
});
test("teachers can mark assigned lessons but cannot act on another teacher’s class", async () => {
  const f = fixture();
  try {
    f.insert("class_sessions", {
      id: "own-lesson",
      class_run_id: "run-primary",
      starts_at: "2099-01-01 09:00",
      ends_at: "2099-01-01 10:00",
    });
    f.insert("class_teacher_bookings", {
      id: "teaching",
      class_session_id: "own-lesson",
      teacher_id: "teacher",
      starts_at: "2099-01-01 09:00",
      ends_at: "2099-01-01 10:00",
    });
    const actor = { ...f.admin, role: "teacher", teacher_id: "teacher" };
    await authorizePortalAction(f.adapter, actor, {
      action: "setCurrentLesson",
      sessionId: "own-lesson",
    });
    await assert.rejects(
      authorizePortalAction(f.adapter, actor, {
        action: "setCurrentLesson",
        sessionId: "another-lesson",
      }),
    );
    await assert.rejects(
      authorizePortalAction(f.adapter, actor, {
        action: "publishClassRun",
        runId: "run-primary",
      }),
    );
  } finally {
    f.close();
  }
});
