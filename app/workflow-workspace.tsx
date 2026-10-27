"use client";
import { useState, type FormEvent } from "react";
import { RegistrationForm } from "./registration-form";
import { useDialogFocus } from "./lib/use-dialog-focus";
import {
  academicStage,
  defaultBookingPolicy,
  type BookingPolicy,
} from "./lib/booking-policy";
import type { BusinessRow as Row } from "./lib/business-workflow";

export type WorkflowData = {
  registrations: Row[];
  invoices: Row[];
  membershipPayments: Row[];
  courseRequirements: Row[];
  memberships: Row[];
  accessPasses: Row[];
  tasks: Row[];
  outbox: Row[];
  policy: BookingPolicy;
};
export const emptyWorkflow: WorkflowData = {
  registrations: [],
  invoices: [],
  membershipPayments: [],
  courseRequirements: [],
  memberships: [],
  accessPasses: [],
  tasks: [],
  outbox: [],
  policy: defaultBookingPolicy,
};
type Props = {
  data: {
    workflow: WorkflowData;
    courses: Row[];
    teachers: Row[];
    students: Row[];
  };
  admin: boolean;
  studentId: string;
  busy: boolean;
  run: (action: string, values?: Row) => Promise<boolean>;
};
const val = (row: Row | undefined, key: string) => String(row?.[key] ?? "");
const rm = (row: Row) => `RM ${(Number(row.amount_cents) / 100).toFixed(2)}`;
const status = (value: unknown) =>
  String(value || "Not submitted").replaceAll("_", " ");

export function WorkflowWorkspace({
  data,
  admin,
  studentId,
  busy,
  run,
}: Props) {
  const [tab, setTab] = useState("applications"),
    [selected, setSelected] = useState(""),
    [editing, setEditing] = useState(false),
    [creating, setCreating] = useState(false);
  const [printRow, setPrintRow] = useState<Row | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const workflow = data.workflow || emptyWorkflow;
  const registration = workflow.registrations.find(
    (r) => r.student_id === (admin ? selected : studentId),
  );
  const ownInvoices = workflow.invoices.filter(
    (r) => r.student_id === (admin ? selected : studentId),
  );
  const closed = ["accepted", "discarded"].includes(
    val(registration, "registration_status"),
  );
  async function submit(values: Row) {
    const ok = await run("submitRegistration", values);
    if (ok) {
      setEditing(false);
      setCreating(false);
    }
    return ok;
  }
  async function saveProfile(values: Row) {
    const ok = await run("updateStudentProfile", {
      ...values,
      studentId: registration?.student_id,
    });
    if (ok) setEditing(false);
    return ok;
  }
  function print(invoice: Row) {
    setPrintRow(invoice);
  }
  return (
    <section className="workflow-workspace">
      <div className="workflow-heading">
        <div>
          <h2>
            {admin ? "Admissions & membership" : "My registration & membership"}
          </h2>
          <p>
            Registration → campus review → membership payment → admission ticket
            → course booking
          </p>
        </div>
        {admin ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setCreating(true);
              setEditing(false);
            }}
          >
            New registration
          </button>
        ) : null}
      </div>
      {admin ? (
        <nav className="workflow-tabs" aria-label="Admissions workspace">
          {[
            ["applications", "Applications"],
            ["membership", "Membership invoices"],
            ["followup", "Welcome & meet and greet"],
            ["accounts", "Portal accounts"],
            ["rules", "Course access rules"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setCreating(false);
                setEditing(false);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}
      {creating ? (
        <div className="workflow-card">
          <button className="quiet-button" onClick={() => setCreating(false)}>
            Close registration
          </button>
          <RegistrationForm busy={busy} onSubmit={submit} />
        </div>
      ) : null}
      {!creating && (tab === "applications" || !admin) ? (
        <div className={admin ? "workflow-split" : ""}>
          {admin ? (
            <div className="workflow-card">
              <h3>Applicants</h3>
              <p className="workflow-muted">
                Existing learners need a complete registration before membership
                can be activated.
              </p>
              <div className="workflow-list">
                {workflow.registrations.map((row) => (
                  <button
                    className={selected === row.student_id ? "active" : ""}
                    key={val(row, "student_id")}
                    type="button"
                    onClick={() => {
                      setSelected(val(row, "student_id"));
                      setEditing(false);
                    }}
                  >
                    <strong>{val(row, "fullName")}</strong>
                    <span>
                      {status(row.registration_status)} · {val(row, "level")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="workflow-card">
            {!registration ? (
              <p>
                {admin
                  ? "Select an applicant to review."
                  : "Loading your registration…"}
              </p>
            ) : (
              <>
                <h3>{val(registration, "fullName")}</h3>
                <p>
                  <b>Application:</b> {status(registration.registration_status)}{" "}
                  · <b>Membership:</b> {status(registration.membership_status)}
                </p>
                {registration.review_note ? (
                  <p className="workflow-notice">
                    Campus note: {val(registration, "review_note")}
                  </p>
                ) : null}
                {!closed ? (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => {
                      setProfileEditing(false);
                      setEditing(!editing || profileEditing);
                    }}
                  >
                    {editing && !profileEditing
                      ? "Close form"
                      : registration.registration_status
                        ? "Review / update details"
                        : "Complete registration"}
                  </button>
                ) : null}
                {admin ? (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    onClick={() => {
                      setProfileEditing(true);
                      setEditing(!editing || !profileEditing);
                    }}
                  >
                    {editing && profileEditing
                      ? "Close profile editor"
                      : "Edit full profile"}
                  </button>
                ) : null}
                {editing ? (
                  <>
                    {admin && profileEditing ? (
                      <p className="workflow-alert">
                        Update the student’s school year, contacts and guardian
                        details here. Changing the email address also changes
                        their sign-in email. Saving the profile keeps the
                        current application and membership status.
                      </p>
                    ) : null}
                    <RegistrationForm
                      key={val(registration, "student_id")}
                      initial={registration}
                      busy={busy}
                      onSubmit={admin && profileEditing ? saveProfile : submit}
                      submitLabel={
                        admin && profileEditing
                          ? "Save full profile"
                          : "Submit registration"
                      }
                    />
                  </>
                ) : (
                  <Profile row={registration} />
                )}
                {admin && registration.registration_status && !closed ? (
                  <ReviewApplication
                    key={val(registration, "registration_id")}
                    id={val(registration, "registration_id")}
                    busy={busy}
                    run={run}
                  />
                ) : null}
                {admin && registration.registration_status === "accepted" ? (
                  <MembershipInvoice
                    key={val(registration, "student_id")}
                    studentId={val(registration, "student_id")}
                    busy={busy}
                    run={run}
                    hasOpen={ownInvoices.some((r) => r.status === "unpaid")}
                  />
                ) : null}
                {ownInvoices.length ? (
                  <InvoiceList
                    invoices={ownInvoices}
                    admin={admin}
                    busy={busy}
                    run={run}
                    print={print}
                  />
                ) : null}
                {workflow.accessPasses
                  .filter((p) => p.student_id === registration.student_id)
                  .map((p) => (
                    <div className="workflow-notice" key={val(p, "id")}>
                      <b>Admission ticket</b>
                      <p>
                        {val(registration, "fullName")} · {val(p, "id")}
                      </p>
                      <p>
                        Membership valid until{" "}
                        {val(p, "valid_until") || "renewed by campus"}. Course
                        credits are recorded separately in My pass.
                      </p>
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() =>
                          setPrintRow({
                            ...p,
                            ticket: true,
                            student_name: registration.fullName,
                          })
                        }
                      >
                        View / print ticket
                      </button>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      ) : null}
      {!creating && admin && tab === "membership" ? (
        <div className="workflow-card">
          <h3>Membership invoices</h3>
          <p>
            Issue invoices from an accepted application. Confirm payment only
            after the campus has received it.
          </p>
          <InvoiceList
            invoices={workflow.invoices}
            admin
            busy={busy}
            run={run}
            print={print}
          />
        </div>
      ) : null}
      {!creating && admin && tab === "followup" ? (
        <div className="workflow-split">
          <div className="workflow-card">
            <h3>Meet and greet</h3>
            {workflow.tasks.length ? (
              workflow.tasks.map((task) => (
                <OnboardingTask
                  task={task}
                  key={val(task, "id")}
                  busy={busy}
                  run={run}
                />
              ))
            ) : (
              <p>No accepted applications yet.</p>
            )}
          </div>
          <div className="workflow-card">
            <h3>Welcome email delivery</h3>
            <p className="workflow-muted">
              Emails stay queued until a server mail provider is configured.
              Delivery status is recorded here.
            </p>
            {workflow.outbox.map((mail) => (
              <div className="workflow-item" key={val(mail, "id")}>
                <b>{val(mail, "recipient")}</b>
                <p>
                  {val(mail, "subject")} · {status(mail.status)}
                </p>
                {mail.last_error ? (
                  <p className="workflow-error">{val(mail, "last_error")}</p>
                ) : null}
                {mail.status !== "sent" ? (
                  <button
                    type="button"
                    className="quiet-button"
                    disabled={busy}
                    onClick={() =>
                      void run("retryWelcomeEmail", {
                        registrationId: val(mail, "id").replace("welcome:", ""),
                      })
                    }
                  >
                    Retry delivery
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {!creating && admin && tab === "accounts" ? (
        <AccountForm data={data} busy={busy} run={run} />
      ) : null}
      {!creating && admin && tab === "rules" ? (
        <>
          <G6Rules
            courses={data.courses}
            policy={workflow.policy}
            busy={busy}
            run={run}
          />
          <CourseRequirements
            courses={data.courses}
            requirements={workflow.courseRequirements || []}
            busy={busy}
            run={run}
          />
        </>
      ) : null}
      {printRow ? (
        <MembershipDocument row={printRow} onClose={() => setPrintRow(null)} />
      ) : null}
    </section>
  );
}
function Profile({ row }: { row: Row }) {
  return (
    <dl className="workflow-profile">
      {[
        ["email", "Email"],
        ["studentPhone", "Student phone"],
        ["gender", "Gender"],
        ["dateOfBirth", "Date of birth"],
        ["enrollmentDate", "Enrolment date"],
        ["preferredLanguage", "Language"],
        ["schoolName", "School"],
        ["schoolSystem", "School system"],
        ["level", "Year / Form"],
        ["chineseName", "Chinese name"],
        ["guardianName", "Guardian"],
        ["relationship", "Relationship"],
        ["guardianGender", "Guardian gender"],
        ["guardianPhone", "Guardian phone"],
        ["guardianEmail", "Guardian email"],
        ["guardianBirth", "Guardian date of birth"],
        ["address1", "Address"],
        ["address2", "Address 2"],
        ["city", "City"],
        ["postCode", "Post code"],
        ["state", "State"],
        ["country", "Country"],
        ["remarks", "Remarks"],
      ].map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{val(row, key) || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
function ReviewApplication({
  id,
  busy,
  run,
}: {
  id: string;
  busy: boolean;
  run: Props["run"];
}) {
  const [note, setNote] = useState("");
  return (
    <div className="workflow-item">
      <h4>Campus review</h4>
      <label className="form-field">
        <span>Review / follow-up note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
        />
      </label>
      <div className="workflow-actions">
        {[
          ["accepted", "Accept registration"],
          ["needs_changes", "Request corrections"],
          ["discarded", "Decline application"],
        ].map(([status, label]) => (
          <button
            className={
              status === "accepted" ? "primary-button" : "quiet-button"
            }
            type="button"
            disabled={busy || (status !== "accepted" && !note.trim())}
            key={status}
            onClick={() =>
              void run("reviewRegistration", {
                registrationId: id,
                status,
                note,
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
function MembershipInvoice({
  studentId,
  busy,
  run,
  hasOpen,
}: {
  studentId: string;
  busy: boolean;
  run: Props["run"];
  hasOpen: boolean;
}) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (
      await run("issueMembershipInvoice", {
        ...Object.fromEntries(new FormData(form)),
        studentId,
        requestKey: key,
      })
    ) {
      form.reset();
      setKey(crypto.randomUUID());
    }
  }
  return (
    <form onSubmit={submit} className="workflow-item">
      <h4>Issue membership invoice</h4>
      {hasOpen ? (
        <p>An unpaid membership invoice already exists below.</p>
      ) : (
        <>
          <div className="workflow-form-grid">
            <label className="form-field">
              <span>Membership fee (RM) *</span>
              <input
                type="number"
                name="amount"
                min="0"
                max="1000000"
                step="0.01"
                required
              />
            </label>
            <label className="form-field">
              <span>Valid until (optional)</span>
              <input type="date" name="validUntil" />
            </label>
          </div>
          <label className="form-field">
            <span>Note / fee waiver reason</span>
            <input name="note" maxLength={2000} />
          </label>
          <button type="submit" disabled={busy} className="primary-button">
            Issue invoice
          </button>
        </>
      )}
    </form>
  );
}
function InvoiceList({
  invoices,
  admin,
  busy,
  run,
  print,
}: {
  invoices: Row[];
  admin: boolean;
  busy: boolean;
  run: Props["run"];
  print: (r: Row) => void;
}) {
  return invoices.length ? (
    <div className="workflow-list">
      {invoices.map((invoice) => (
        <div className="workflow-item" key={val(invoice, "id")}>
          <b>
            {val(invoice, "student_name")} · {rm(invoice)}
          </b>
          <p>
            {val(invoice, "invoice_no")} · {status(invoice.status)}
          </p>
          <button
            className="quiet-button"
            type="button"
            onClick={() => print(invoice)}
          >
            View / print {invoice.status === "paid" ? "receipt" : "invoice"}
          </button>
          {admin && invoice.status === "unpaid" ? (
            <>
              <PaymentForm invoice={invoice} busy={busy} run={run} />
              <button
                type="button"
                className="quiet-button"
                disabled={busy}
                onClick={() =>
                  void run("cancelMembershipInvoice", {
                    membershipInvoiceId: invoice.id,
                  })
                }
              >
                Cancel unpaid invoice
              </button>
            </>
          ) : null}
        </div>
      ))}
    </div>
  ) : (
    <p>No membership invoices.</p>
  );
}
function PaymentForm({
  invoice,
  busy,
  run,
}: {
  invoice: Row;
  busy: boolean;
  run: Props["run"];
}) {
  const [confirm, setConfirm] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      await run("confirmMembershipPayment", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        membershipInvoiceId: invoice.id,
      })
    )
      setConfirm(false);
  }
  return (
    <form onSubmit={submit} className="workflow-item">
      <div className="workflow-form-grid">
        <label className="form-field">
          <span>Payment method</span>
          <select
            name="method"
            defaultValue={
              Number(invoice.amount_cents) === 0
                ? "fee_waiver"
                : "bank_transfer"
            }
          >
            {(Number(invoice.amount_cents) === 0
              ? [["fee_waiver", "Approved fee waiver"]]
              : [
                  ["bank_transfer", "Bank transfer"],
                  ["cash", "Cash"],
                  ["duitnow_qr", "DuitNow QR"],
                ]
            ).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Payment reference</span>
          <input name="reference" maxLength={200} />
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />{" "}
        I have verified this payment / approved waiver.
      </label>
      <div>
        <button
          type="submit"
          disabled={busy || !confirm}
          className="primary-button"
        >
          Record receipt & activate membership
        </button>
      </div>
    </form>
  );
}
function OnboardingTask({
  task,
  busy,
  run,
}: {
  task: Row;
  busy: boolean;
  run: Props["run"];
}) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run("updateOnboardingTask", {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      taskId: task.id,
    });
  }
  return (
    <form className="workflow-item" onSubmit={submit}>
      <b>{val(task, "student_name")}</b>
      <p>{val(task, "title")}</p>
      <label className="form-field">
        <span>Meeting time</span>
        <input
          type="datetime-local"
          name="scheduledAt"
          defaultValue={val(task, "scheduled_at").replace(" ", "T")}
        />
      </label>
      <label className="form-field">
        <span>Status</span>
        <select name="status" defaultValue={val(task, "status")}>
          {["pending", "scheduled", "completed", "cancelled"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Follow-up note</span>
        <input name="note" defaultValue={val(task, "note")} maxLength={2000} />
      </label>
      <button className="quiet-button" disabled={busy} type="submit">
        Save follow-up
      </button>
    </form>
  );
}
function AccountForm({
  data,
  busy,
  run,
}: {
  data: Props["data"];
  busy: boolean;
  run: Props["run"];
}) {
  const [role, setRole] = useState("teacher");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (
      await run("createStaffAccount", {
        ...Object.fromEntries(new FormData(form)),
        teacherId:
          role === "teacher" ? new FormData(form).get("personId") : undefined,
        studentId:
          role === "student" ? new FormData(form).get("personId") : undefined,
      })
    )
      form.reset();
  }
  return (
    <form onSubmit={submit} className="workflow-card auth-form">
      <h3>Create a linked portal account</h3>
      <p>
        Students can register themselves. Use this form for existing learners or
        teachers.
      </p>
      <label className="form-field">
        <span>Role</span>
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="teacher">Teacher</option>
          <option value="student">Student</option>
        </select>
      </label>
      <label className="form-field">
        <span>{role === "teacher" ? "Teacher" : "Student"}</span>
        <select key={role} name="personId" required>
          <option value="">Choose</option>
          {(role === "teacher" ? data.teachers : data.students).map((r) => (
            <option key={val(r, "id")} value={val(r, "id")}>
              {val(r, "name")}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Login email</span>
        <input name="email" type="email" required />
      </label>
      <label className="form-field">
        <span>Initial password (12+ characters)</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          required
        />
      </label>
      <button type="submit" disabled={busy} className="primary-button">
        Create account
      </button>
    </form>
  );
}
function G6Rules({
  courses,
  policy,
  busy,
  run,
}: {
  courses: Row[];
  policy: BookingPolicy;
  busy: boolean;
  run: Props["run"];
}) {
  const [ids, setIds] = useState(policy.g6SecondaryCourseIds);
  return (
    <div className="workflow-card">
      <h3>G6 access to secondary courses</h3>
      <p>
        Only the secondary courses selected here are available to G6 learners.
        Primary and secondary restrictions remain in effect for other learners.
      </p>
      <div className="workflow-list">
        {courses
          .filter((c) => academicStage(c) === "secondary")
          .map((c) => (
            <label className="workflow-item" key={val(c, "id")}>
              <input
                type="checkbox"
                checked={ids.includes(val(c, "id"))}
                onChange={(e) =>
                  setIds((previous) =>
                    e.target.checked
                      ? [...previous, val(c, "id")]
                      : previous.filter((id) => id !== c.id),
                  )
                }
              />{" "}
              {val(c, "title")} · {val(c, "level")}
            </label>
          ))}
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={busy}
        onClick={() =>
          void run("saveBookingPolicy", { g6SecondaryCourseIds: ids })
        }
      >
        Save G6 exceptions
      </button>
      <p className="workflow-muted">
        Membership fees are entered per invoice. Existing credit usage, 30-day
        validity and 48-hour leave rules continue to apply.
      </p>
    </div>
  );
}

function CourseRequirements({
  courses,
  requirements,
  busy,
  run,
}: {
  courses: Row[];
  requirements: Row[];
  busy: boolean;
  run: Props["run"];
}) {
  const [id, setId] = useState(val(courses[0], "id"));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run("saveCourseRequirements", {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      courseId: id,
    });
  }
  return (
    <form className="workflow-card auth-form" onSubmit={submit}>
      <h3>Course prerequisites</h3>
      <p>
        Record curriculum prerequisites for staff review and display during
        course selection.
      </p>
      <label className="form-field">
        <span>Course / grade</span>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {courses.map((c) => (
            <option key={val(c, "id")} value={val(c, "id")}>
              {val(c, "title")} · {val(c, "level")}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Prerequisites / entry requirements</span>
        <textarea
          key={id}
          name="prerequisites"
          defaultValue={val(
            requirements.find((r) => r.course_id === id),
            "prerequisites",
          )}
          maxLength={2000}
        />
      </label>
      <button className="primary-button" disabled={busy} type="submit">
        Save prerequisites
      </button>
    </form>
  );
}

function MembershipDocument({
  row,
  onClose,
}: {
  row: Row;
  onClose: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div
      ref={ref}
      className="workflow-modal"
      role="dialog"
      aria-modal="true"
      aria-label={row.ticket ? "Admission ticket" : "Membership document"}
    >
      <div className="workflow-card workflow-print">
        <h2>UniqGuru Pintar</h2>
        <h3>
          {row.ticket
            ? "Admission ticket"
            : row.status === "paid"
              ? row.method === "fee_waiver"
                ? "Membership fee waiver confirmation"
                : "Official membership receipt"
              : "Membership invoice"}
        </h3>
        <p>{val(row, "student_name")}</p>
        <p>
          Reference:{" "}
          {val(
            row,
            row.ticket
              ? "id"
              : row.status === "paid"
                ? "receipt_no"
                : "invoice_no",
          )}
        </p>
        {!row.ticket ? (
          <>
            <p>Invoice: {val(row, "invoice_no")}</p>
            <p>Issued: {val(row, "created_at") || "Not recorded"}</p>
            <table className="workflow-document-table">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Membership fee</td>
                  <td>{rm(row)}</td>
                </tr>
              </tbody>
            </table>
            <p>Amount: {rm(row)}</p>
            <p>Status: {status(row.status)}</p>
            {row.status === "paid" ? (
              <>
                <p>
                  Payment recorded:{" "}
                  {val(row, "received_at") ||
                    val(row, "paid_at") ||
                    "Not recorded"}
                </p>
                <p>
                  Payment method: {status(row.method)} · {val(row, "reference")}
                </p>
              </>
            ) : null}
            {row.note ? <p>Campus note: {val(row, "note")}</p> : null}
          </>
        ) : null}
        <p>
          Membership valid until:{" "}
          {val(row, "valid_until") || "No fixed end date configured"}
        </p>
        <div className="workflow-actions no-print">
          <button
            type="button"
            className="primary-button"
            onClick={() => window.print()}
          >
            Print
          </button>
          <button type="button" className="quiet-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
