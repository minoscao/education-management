import type { Database } from "./learning-store";
import type { PortalActor } from "./portal-auth";
import { AccessError } from "./portal-auth";
import {
  readBookingPolicy,
  membershipReason,
  stageReason,
  academicStage,
} from "./booking-policy";
export type BusinessRow = Record<string, unknown>;
export const registrationFields = [
  ["fullName", "Full name", true],
  ["gender", "Gender", true],
  ["dateOfBirth", "Date of birth", false],
  ["enrollmentDate", "Enrollment date", true],
  ["email", "Student email", true],
  ["studentPhone", "Student contact number", true],
  ["preferredLanguage", "Preferred language", true],
  ["schoolName", "School name", true],
  ["schoolSystem", "School system", true],
  ["level", "Year / Form", true],
  ["chineseName", "Chinese name", false],
  ["remarks", "Remarks", false],
  ["guardianName", "Guardian full name", true],
  ["relationship", "Relationship", true],
  ["guardianPhone", "Guardian phone", true],
  ["guardianGender", "Guardian gender", true],
  ["guardianEmail", "Guardian email", false],
  ["guardianBirth", "Guardian date of birth", false],
  ["address1", "Address 1", false],
  ["address2", "Address 2", false],
  ["city", "City", false],
  ["postCode", "Post code", false],
  ["state", "State / Province / Region", false],
  ["country", "Country", false],
] as const;
export class RegistrationError extends AccessError {
  constructor(public fields: Record<string, string>) {
    super("Review the highlighted registration fields.", 400);
  }
}
const string = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateRegistration(input: BusinessRow) {
  const fields: Record<string, string> = {},
    data: Record<string, string> = {};
  for (const [key, label, required] of registrationFields) {
    data[key] = string(input[key]);
    if (required && !data[key]) fields[key] = `${label} is required.`;
    if (data[key].length > 2000) fields[key] = "Use 2,000 characters or fewer.";
  }
  data.email = data.email.toLowerCase();
  for (const key of ["email", "guardianEmail"])
    if (data[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[key]))
      fields[key] = "Enter a valid email address.";
  for (const key of ["studentPhone", "guardianPhone"])
    if (data[key] && !/^\+?[\d\s()-]{7,25}$/.test(data[key]))
      fields[key] = "Enter a valid contact number.";
  for (const key of ["dateOfBirth", "enrollmentDate", "guardianBirth"])
    if (data[key] && !validDate(data[key]))
      fields[key] = "Choose a valid date.";
  for (const key of ["dateOfBirth", "guardianBirth"])
    if (data[key] > today())
      fields[key] = "A date of birth cannot be in the future.";
  if (!["sjk", "sk", "smk", "independent"].includes(data.schoolSystem))
    fields.schoolSystem = "Choose a school system.";
  const pattern =
    data.schoolSystem === "sjk" || data.schoolSystem === "sk"
      ? /^G[1-6]$/
      : data.schoolSystem === "smk"
        ? /^F[1-6]$/
        : /^(?:J[1-3]|S[1-3]|L[1-3]|H[1-3])$/;
  if (!pattern.test(data.level.toUpperCase()))
    fields.level = "Choose a year or form for the selected school system.";
  data.level = data.level.toUpperCase();
  if (Object.keys(fields).length) throw new RegistrationError(fields);
  return data;
}
export class BusinessWorkflow {
  constructor(readonly db: Database) {}
  async one<T = BusinessRow>(sql: string, values: unknown[] = []) {
    return this.db
      .prepare(sql)
      .bind(...values)
      .first<T>();
  }
  async all<T = BusinessRow>(sql: string, values: unknown[] = []) {
    return (
      (
        await this.db
          .prepare(sql)
          .bind(...values)
          .all<T>()
      ).results || []
    );
  }
  async batch(queries: { sql: string; values: unknown[] }[]) {
    await this.db.batch(
      queries.map((q) => this.db.prepare(q.sql).bind(...q.values)),
    );
  }
  async submitRegistration(
    input: BusinessRow,
    actor?: PortalActor,
    accountHash?: string,
  ) {
    if (!actor && input.studentId)
      throw new AccessError("Existing student records must be linked by the campus.", 403);
    const data = validateRegistration(input);
    let studentId =
      actor?.role === "student"
        ? actor.student_id || ""
        : actor?.role === "admin" ? string(input.studentId) : "";
    const existing = studentId
      ? await this.one("SELECT id FROM students WHERE id=?", [studentId])
      : null;
    if (studentId && !existing)
      throw new AccessError("Student not found.", 404);
    const old = studentId
      ? await this.one(
          "SELECT * FROM student_registrations WHERE student_id=?",
          [studentId],
        )
      : null;
    if (old && ["accepted", "discarded"].includes(String(old.status)))
      throw new AccessError(
        "This application is closed. Contact the campus to update it.",
        409,
      );
    if (actor?.role === "student" && data.email !== actor.email)
      throw new RegistrationError({
        email: "Use your account email for registration.",
      });
    studentId ||= crypto.randomUUID();
    const registrationId = String(old?.id || crypto.randomUUID()),
      accountId = crypto.randomUUID();
    const schoolType =
      data.schoolSystem === "sjk"
        ? "chinese"
        : data.schoolSystem === "independent"
          ? "independent"
          : "malay";
    const queries = [
      {
        sql: existing
          ? "UPDATE students SET name=?,level=?,guardian_phone=?,email=?,school_type=?,status='pending' WHERE id=?"
          : "INSERT INTO students(name,level,guardian_phone,email,school_type,status,id,code) VALUES (?,?,?,?,?,'pending',?,?)",
        values: existing
          ? [
              data.fullName,
              data.level,
              data.guardianPhone,
              data.email,
              schoolType,
              studentId,
            ]
          : [
              data.fullName,
              data.level,
              data.guardianPhone,
              data.email,
              schoolType,
              studentId,
              `REG-${studentId}`,
            ],
      },
      {
        sql: `INSERT INTO student_profiles(student_id,gender,date_of_birth,enrollment_date,student_phone,preferred_language,school_name,school_system,chinese_name,remarks) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET gender=excluded.gender,date_of_birth=excluded.date_of_birth,enrollment_date=excluded.enrollment_date,student_phone=excluded.student_phone,preferred_language=excluded.preferred_language,school_name=excluded.school_name,school_system=excluded.school_system,chinese_name=excluded.chinese_name,remarks=excluded.remarks`,
        values: [
          studentId,
          data.gender,
          data.dateOfBirth,
          data.enrollmentDate,
          data.studentPhone,
          data.preferredLanguage,
          data.schoolName,
          data.schoolSystem,
          data.chineseName,
          data.remarks,
        ],
      },
      {
        sql: `INSERT INTO student_guardians(student_id,full_name,relationship,gender,phone,email,date_of_birth,address1,address2,city,post_code,state,country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET full_name=excluded.full_name,relationship=excluded.relationship,gender=excluded.gender,phone=excluded.phone,email=excluded.email,date_of_birth=excluded.date_of_birth,address1=excluded.address1,address2=excluded.address2,city=excluded.city,post_code=excluded.post_code,state=excluded.state,country=excluded.country`,
        values: [
          studentId,
          data.guardianName,
          data.relationship,
          data.guardianGender,
          data.guardianPhone,
          data.guardianEmail,
          data.guardianBirth,
          data.address1,
          data.address2,
          data.city,
          data.postCode,
          data.state,
          data.country,
        ],
      },
      {
        sql: "INSERT INTO student_registrations(id,student_id,status) VALUES (?,?,'submitted') ON CONFLICT(student_id) DO UPDATE SET status='submitted',review_note='',submitted_at=CURRENT_TIMESTAMP",
        values: [registrationId, studentId],
      },
      {
        sql: "INSERT INTO student_memberships(student_id,status) VALUES (?,'pending') ON CONFLICT(student_id) DO NOTHING",
        values: [studentId],
      },
      {
        sql: "INSERT INTO registration_history(registration_id,status,note,actor_id) VALUES (?,'submitted','Registration submitted',?)",
        values: [registrationId, actor?.id || accountId],
      },
    ];
    if (accountHash)
      queries.push({
        sql: "INSERT INTO portal_accounts(id,email,password_hash,display_name,role,student_id) VALUES (?,?,?,?,'student',?)",
        values: [accountId, data.email, accountHash, data.fullName, studentId],
      });
    await this.batch(queries);
    return { studentId, registrationId, accountId };
  }
  async updateStudentProfile(input: BusinessRow, actor: PortalActor) {
    if (actor.role !== "admin") throw new AccessError("Only the campus can update an accepted student profile.");
    const studentId = string(input.studentId);
    const old = (await this.snapshot(actor)).registrations.find(row => row.student_id === studentId);
    if (!old) throw new AccessError("Student not found.", 404);
    const data = validateRegistration(input);
    const duplicate = await this.one("SELECT id FROM portal_accounts WHERE email=? AND (student_id IS NULL OR student_id!=?)", [data.email, studentId]);
    if (duplicate) throw new RegistrationError({ email: "This email is already used by another account." });
    const schoolType = data.schoolSystem === "sjk" ? "chinese" : data.schoolSystem === "independent" ? "independent" : "malay";
    const changed = registrationFields.map(([key]) => key).filter(key => String(old[key] || "") !== data[key]);
    await this.batch([
      { sql: "UPDATE students SET name=?,level=?,guardian_phone=?,email=?,school_type=? WHERE id=?", values: [data.fullName,data.level,data.guardianPhone,data.email,schoolType,studentId] },
      { sql: "UPDATE portal_accounts SET email=?,display_name=? WHERE student_id=?", values: [data.email,data.fullName,studentId] },
      { sql: "INSERT INTO student_profiles(student_id,gender,date_of_birth,enrollment_date,student_phone,preferred_language,school_name,school_system,chinese_name,remarks) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET gender=excluded.gender,date_of_birth=excluded.date_of_birth,enrollment_date=excluded.enrollment_date,student_phone=excluded.student_phone,preferred_language=excluded.preferred_language,school_name=excluded.school_name,school_system=excluded.school_system,chinese_name=excluded.chinese_name,remarks=excluded.remarks", values: [studentId,data.gender,data.dateOfBirth,data.enrollmentDate,data.studentPhone,data.preferredLanguage,data.schoolName,data.schoolSystem,data.chineseName,data.remarks] },
      { sql: "INSERT INTO student_guardians(student_id,full_name,relationship,gender,phone,email,date_of_birth,address1,address2,city,post_code,state,country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET full_name=excluded.full_name,relationship=excluded.relationship,gender=excluded.gender,phone=excluded.phone,email=excluded.email,date_of_birth=excluded.date_of_birth,address1=excluded.address1,address2=excluded.address2,city=excluded.city,post_code=excluded.post_code,state=excluded.state,country=excluded.country", values: [studentId,data.guardianName,data.relationship,data.guardianGender,data.guardianPhone,data.guardianEmail,data.guardianBirth,data.address1,data.address2,data.city,data.postCode,data.state,data.country] },
      { sql: "INSERT INTO student_profile_history(id,student_id,actor_id,changed_fields) VALUES (?,?,?,?)", values: [crypto.randomUUID(),studentId,actor.id,JSON.stringify(changed)] },
    ]);
  }
  async reviewRegistration(input: BusinessRow, actor: PortalActor) {
    const id = string(input.registrationId),
      status = string(input.status),
      note = string(input.note);
    if (!["accepted", "needs_changes", "discarded"].includes(status))
      throw new AccessError("Choose an application outcome.", 400);
    if (status !== "accepted" && !note)
      throw new AccessError("Add a note explaining what is needed.", 400);
    const registration = await this.one(
      "SELECT r.*,s.name,s.email FROM student_registrations r JOIN students s ON s.id=r.student_id WHERE r.id=?",
      [id],
    );
    if (!registration) throw new AccessError("Registration not found.", 404);
    if (registration.status === status) return;
    if (["accepted", "discarded"].includes(String(registration.status)))
      throw new AccessError("This application has already been closed.", 409);
    const queries = [
      {
        sql: "UPDATE student_registrations SET status=?,review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?",
        values: [status, note, actor.id, id],
      },
      {
        sql: "INSERT INTO registration_history(registration_id,status,note,actor_id) VALUES (?,?,?,?)",
        values: [id, status, note, actor.id],
      },
      {
        sql: "UPDATE students SET status=? WHERE id=?",
        values: [
          status === "accepted"
            ? "active"
            : status === "discarded"
              ? "inactive"
              : "pending",
          registration.student_id,
        ],
      },
    ];
    if (status === "accepted") {
      queries.push(
        {
          sql: "INSERT INTO notification_outbox(id,student_id,recipient,subject,body) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
          values: [
            `welcome:${id}`,
            registration.student_id,
            registration.email,
            "Welcome to UniqGuru Pintar",
            `Hello ${registration.name}, your registration has been accepted. Please contact the campus to arrange your meet and greet and complete membership payment.`,
          ],
        },
        {
          sql: "INSERT INTO onboarding_tasks(id,student_id,title) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING",
          values: [
            `orientation:${id}`,
            registration.student_id,
            "Arrange meet and greet / orientation",
          ],
        },
      );
    }
    await this.batch(queries);
  }
  async issueMembershipInvoice(input: BusinessRow) {
    const studentId = string(input.studentId),
      key = string(input.requestKey),
      amount = Number(input.amount),
      until = string(input.validUntil);
    if (
      !["string", "number"].includes(typeof input.amount) ||
      String(input.amount).trim() === ""
    )
      throw new AccessError("Enter the membership amount explicitly.", 400);
    if (
      !/^[\w-]{8,100}$/.test(key) ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > 1000000 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001
    )
      throw new AccessError(
        "Enter a valid membership amount with at most two decimals.",
        400,
      );
    if (until && (!validDate(until) || until < today()))
      throw new AccessError(
        "Choose a current or future membership end date.",
        400,
      );
    if (amount === 0 && !string(input.note))
      throw new AccessError(
        "Explain the fee waiver before issuing a zero-value invoice.",
        400,
      );
    const reg = await this.one(
      "SELECT id FROM student_registrations WHERE student_id=? AND status='accepted'",
      [studentId],
    );
    if (!reg)
      throw new AccessError(
        "Accept the complete registration before issuing a membership invoice.",
        400,
      );
    const prior = await this.one(
      "SELECT student_id,amount_cents FROM membership_invoices WHERE request_key=?",
      [key],
    );
    if (prior) {
      if (
        prior.student_id !== studentId ||
        Number(prior.amount_cents) !== Math.round(amount * 100)
      )
        throw new AccessError(
          "This invoice reference is already used. Start a new invoice.",
          409,
        );
      return;
    }
    const id = crypto.randomUUID();
    await this.batch([
      {
        sql: "INSERT INTO membership_invoices(id,request_key,invoice_no,student_id,amount_cents,valid_until,note) VALUES (?,?,?,?,?,?,?)",
        values: [
          id,
          key,
          `MI-${today().replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`,
          studentId,
          Math.round(amount * 100),
          until || null,
          string(input.note),
        ],
      },
      {
        sql: "UPDATE student_memberships SET status=CASE WHEN status='active' THEN status ELSE 'invoiced' END,updated_at=CURRENT_TIMESTAMP WHERE student_id=?",
        values: [studentId],
      },
    ]);
  }
  async confirmMembershipPayment(input: BusinessRow, actor: PortalActor) {
    const id = string(input.membershipInvoiceId),
      method = string(input.method),
      ref = string(input.reference);
    if (!["cash", "bank_transfer", "duitnow_qr", "fee_waiver"].includes(method))
      throw new AccessError("Choose the recorded payment method.", 400);
    const invoice = await this.one(
      "SELECT * FROM membership_invoices WHERE id=?",
      [id],
    );
    if (!invoice) throw new AccessError("Membership invoice not found.", 404);
    if (invoice.status === "paid") return;
    if (invoice.status !== "unpaid")
      throw new AccessError("This invoice is no longer payable.", 409);
    if (invoice.valid_until && String(invoice.valid_until) < today())
      throw new AccessError(
        "Renew the membership dates before recording payment.",
        400,
      );
    if ((Number(invoice.amount_cents) === 0) !== (method === "fee_waiver"))
      throw new AccessError(
        "Use fee waiver only for an explicitly waived, zero-value invoice.",
        400,
      );
    await this.batch([
      {
        sql: "INSERT INTO membership_receipts(id,invoice_id,receipt_no,amount_cents,method,reference,received_by) SELECT ?,id,?,amount_cents,?,?,? FROM membership_invoices WHERE id=? AND status='unpaid' ON CONFLICT(invoice_id) DO NOTHING",
        values: [
          `${id}:receipt`,
          `MR-${id.slice(0, 8).toUpperCase()}`,
          method,
          ref,
          actor.id,
          id,
        ],
      },
      {
        sql: "UPDATE membership_invoices SET status='paid',paid_at=CURRENT_TIMESTAMP WHERE id=? AND status='unpaid'",
        values: [id],
      },
      {
        sql: "INSERT INTO student_memberships(student_id,status,valid_until) SELECT student_id,'active',valid_until FROM membership_invoices WHERE id=? AND status='paid' ON CONFLICT(student_id) DO UPDATE SET status='active',valid_until=excluded.valid_until,updated_at=CURRENT_TIMESTAMP",
        values: [id],
      },
      {
        sql: "INSERT INTO membership_access_passes(id,invoice_id,student_id,valid_until) SELECT ?,id,student_id,valid_until FROM membership_invoices WHERE id=? AND status='paid' ON CONFLICT(invoice_id) DO NOTHING",
        values: [`${id}:access`, id],
      },
    ]);
  }
  async cancelMembershipInvoice(input: BusinessRow) {
    const invoice = await this.one(
      "SELECT * FROM membership_invoices WHERE id=?",
      [string(input.membershipInvoiceId)],
    );
    if (!invoice) throw new AccessError("Membership invoice not found.", 404);
    if (invoice.status === "paid")
      throw new AccessError(
        "A paid receipt cannot be cancelled through the unpaid invoice workflow.",
        409,
      );
    await this.batch([
      {
        sql: "UPDATE membership_invoices SET status='cancelled' WHERE id=? AND status='unpaid'",
        values: [invoice.id],
      },
      {
        sql: "UPDATE student_memberships SET status=CASE WHEN status='active' THEN status ELSE 'pending' END,updated_at=CURRENT_TIMESTAMP WHERE student_id=? AND EXISTS(SELECT 1 FROM membership_invoices WHERE id=? AND status='cancelled')",
        values: [invoice.student_id, invoice.id],
      },
    ]);
  }
  async saveCourseRequirements(input: BusinessRow) {
    const courseId = string(input.courseId),
      note = string(input.prerequisites);
    if (
      note.length > 2000 ||
      !(await this.one("SELECT id FROM course_catalogs WHERE id=?", [courseId]))
    )
      throw new AccessError(
        "Choose a course and use 2,000 characters or fewer.",
        400,
      );
    await this.db
      .prepare(
        "INSERT INTO course_requirements(course_id,prerequisites) VALUES (?,?) ON CONFLICT(course_id) DO UPDATE SET prerequisites=excluded.prerequisites,updated_at=CURRENT_TIMESTAMP",
      )
      .bind(courseId, note)
      .run();
  }
  async assertBooking(studentId: string, runId?: string, sessionId?: string) {
    const setting = await this.one<{ value: string }>(
      "SELECT value FROM app_settings WHERE key='booking_policy_v1'",
    );
    const policy = readBookingPolicy(setting?.value);
    const student = await this.one(
      "SELECT s.*,p.school_system FROM students s LEFT JOIN student_profiles p ON p.student_id=s.id WHERE s.id=?",
      [studentId],
    );
    if (!student) throw new AccessError("Choose an existing learner.", 400);
    if (policy.requireMembership) {
      const reg = await this.one(
        "SELECT id FROM student_registrations WHERE student_id=? AND status='accepted'",
        [studentId],
      );
      const membership = await this.one(
        "SELECT * FROM student_memberships WHERE student_id=?",
        [studentId],
      );
      const reason = membershipReason(membership || undefined, today());
      if (!reg || reason)
        throw new AccessError(
          reason || "Your registration has not been accepted.",
          403,
        );
    }
    if (!runId && !sessionId) return;
    if (sessionId && runId) {
      const session = await this.one(
        "SELECT class_run_id FROM class_sessions WHERE id=?",
        [sessionId],
      );
      if (!session || session.class_run_id !== runId)
        throw new AccessError(
          "This lesson does not belong to the selected course.",
          400,
        );
    }
    const course = await this.one(
      `SELECT c.*,r.status AS run_status FROM course_catalogs c JOIN class_runs r ON r.course_id=c.id WHERE ${sessionId ? "r.id=(SELECT class_run_id FROM class_sessions WHERE id=?)" : "r.id=?"}`,
      [sessionId || runId],
    );
    if (!course || course.status !== "active" || course.run_status !== "open")
      throw new AccessError(
        "This class has not been published for booking.",
        400,
      );
    const reason = stageReason(student, course, policy);
    if (reason) throw new AccessError(reason, 403);
  }
  async savePolicy(input: BusinessRow) {
    const ids = Array.isArray(input.g6SecondaryCourseIds)
      ? input.g6SecondaryCourseIds.map(String)
      : [];
    const courses = await this.all("SELECT id,level FROM course_catalogs");
    if (
      ids.some(
        (id) =>
          !courses.some((c) => c.id === id && academicStage(c) === "secondary"),
      )
    )
      throw new AccessError("Choose existing courses for G6 exceptions.", 400);
    await this.db
      .prepare(
        "UPDATE app_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='booking_policy_v1'",
      )
      .bind(
        JSON.stringify({
          requireMembership: true,
          enforceSchoolStage: true,
          g6SecondaryCourseIds: [...new Set(ids)],
        }),
      )
      .run();
  }
  async snapshot(actor: PortalActor) {
    const own = actor.role === "admin" ? "" : " WHERE s.id=?",
      values = actor.role === "admin" ? [] : [actor.student_id || ""];
    const registrations = await this.all(
      `SELECT r.id AS registration_id,r.status AS registration_status,r.review_note,r.submitted_at,s.id AS student_id,s.name AS fullName,s.email,s.level,p.gender,p.date_of_birth AS dateOfBirth,p.enrollment_date AS enrollmentDate,p.student_phone AS studentPhone,p.preferred_language AS preferredLanguage,p.school_name AS schoolName,p.school_system AS schoolSystem,p.chinese_name AS chineseName,p.remarks,g.full_name AS guardianName,g.relationship,g.gender AS guardianGender,g.phone AS guardianPhone,g.email AS guardianEmail,g.date_of_birth AS guardianBirth,g.address1,g.address2,g.city,g.post_code AS postCode,g.state,g.country,m.status AS membership_status,m.valid_until FROM students s LEFT JOIN student_registrations r ON r.student_id=s.id LEFT JOIN student_profiles p ON p.student_id=s.id LEFT JOIN student_guardians g ON g.student_id=s.id LEFT JOIN student_memberships m ON m.student_id=s.id${own} ORDER BY r.submitted_at DESC,s.name`,
      values,
    );
    const filter = actor.role === "admin" ? "" : " WHERE student_id=?";
    const invoices = await this.all(
      `SELECT i.*,s.name AS student_name,r.receipt_no,r.method,r.reference FROM membership_invoices i JOIN students s ON s.id=i.student_id LEFT JOIN membership_receipts r ON r.invoice_id=i.id${actor.role === "admin" ? "" : " WHERE i.student_id=?"} ORDER BY i.created_at DESC`,
      values,
    );
    return {
      registrations,
      invoices,
      membershipPayments: await this.all(
        `SELECT r.*,i.student_id,i.invoice_no,s.name AS student_name FROM membership_receipts r JOIN membership_invoices i ON i.id=r.invoice_id JOIN students s ON s.id=i.student_id${actor.role === "admin" ? "" : " WHERE i.student_id=?"} ORDER BY r.received_at DESC`,
        values,
      ),
      courseRequirements: await this.all("SELECT * FROM course_requirements"),
      policy: readBookingPolicy(
        (
          await this.one<{ value: string }>(
            "SELECT value FROM app_settings WHERE key='booking_policy_v1'",
          )
        )?.value,
      ),
      memberships: await this.all(
        `SELECT * FROM student_memberships${filter}`,
        values,
      ),
      accessPasses: await this.all(
        `SELECT * FROM membership_access_passes${filter}`,
        values,
      ),
      tasks:
        actor.role === "admin"
          ? await this.all(
              "SELECT t.*,s.name AS student_name FROM onboarding_tasks t JOIN students s ON s.id=t.student_id",
            )
          : [],
      outbox:
        actor.role === "admin"
          ? await this.all(
              "SELECT id,student_id,recipient,subject,status,attempts,last_error FROM notification_outbox",
            )
          : [],
    };
  }
}
