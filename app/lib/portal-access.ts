import type { Database } from "./learning-store";
import type { PortalActor } from "./portal-auth";
import { AccessError } from "./portal-auth";
type Row = Record<string, unknown>;
const studentActions = new Set([
  "checkoutCourse",
  "purchasePass",
  "bookLesson",
  "bookCourseWithCredit",
  "useOnlineCredit",
  "bookStudy",
  "useStudyCredit",
  "cancelStudy",
  "requestLeave",
  "addCourseExtra",
  "submitRegistration",
]);
export async function authorizePortalAction(
  db: Database,
  actor: PortalActor,
  payload: Row,
) {
  if (actor.role === "admin") return;
  if (actor.role === "teacher") {
    if (!["setAttendance", "setCurrentLesson"].includes(String(payload.action)))
      throw new AccessError("This action requires an administrator.");
    const sessionId =
      payload.action === "setAttendance"
        ? (
            await db
              .prepare(
                "SELECT class_session_id FROM class_student_bookings WHERE id=?",
              )
              .bind(payload.studentBookingId)
              .first<{ class_session_id: string }>()
          )?.class_session_id
        : payload.sessionId;
    const owned = await db
      .prepare(
        "SELECT id FROM class_teacher_bookings WHERE class_session_id=? AND teacher_id=? AND status!='cancelled'",
      )
      .bind(sessionId || "", actor.teacher_id || "")
      .first();
    if (!owned) throw new AccessError("This lesson is not assigned to you.");
    return;
  }
  if (!studentActions.has(String(payload.action)))
    throw new AccessError("This action requires an administrator.");
  if (
    !actor.student_id ||
    (payload.studentId && payload.studentId !== actor.student_id)
  )
    throw new AccessError("You can only update your own learning records.");
  payload.studentId = actor.student_id;
  if (payload.action === "purchasePass" &&
      (payload.payNow === true || payload.payNow === "true"))
    throw new AccessError("Only the campus can confirm a received payment.");
  if (payload.action === "addCourseExtra") {
    const owned = await db
      .prepare("SELECT id FROM pass_orders WHERE id=? AND student_id=?")
      .bind(payload.passOrderId, actor.student_id)
      .first();
    if (!owned) throw new AccessError("Order not found.");
  }
}
export function scopePortalData(
  data: Record<string, unknown>,
  actor: PortalActor,
) {
  if (actor.role === "admin") return data;
  const arrays = data as Record<string, Row[]>;
  const allSessions = arrays.sessions || [];
  const ownSessionIds = new Set(
    (arrays.teacherBookings || [])
      .filter(
        (b) => b.teacher_id === actor.teacher_id && b.status !== "cancelled",
      )
      .map((b) => b.class_session_id),
  );
  const relatedStudents = new Set(
    (arrays.bookings || [])
      .filter((b) => ownSessionIds.has(b.class_session_id))
      .map((b) => b.student_id),
  );
  const own = (row: Row) => row.student_id === actor.student_id;
  const teacher = actor.role === "teacher";
  const publishedRunIds = new Set((arrays.runs || [])
    .filter(row => ["open", "finished"].includes(String(row.status)))
    .map(row => row.id));
  const historicalSessionIds = new Set((arrays.bookings || []).filter(own).map(row => row.class_session_id));
  const attendance = (arrays.attendance || []).filter((row) =>
    teacher ? ownSessionIds.has(row.class_session_id) : own(row),
  );
  const bookings = (arrays.bookings || []).flatMap((row, index) => {
    if (teacher) return ownSessionIds.has(row.class_session_id) ? [row] : [];
    if (own(row)) return [row];
    // Capacity totals are visible; other learners' identities and financial links are not.
    return row.status === "booked"
      ? [
          {
            id: `seat-${index}`,
            class_session_id: row.class_session_id,
            student_id: "",
            delivery_mode: row.delivery_mode,
            status: "booked",
          },
        ]
      : [];
  });
  const sessions = allSessions
    .filter((row) => teacher ? ownSessionIds.has(row.id) : publishedRunIds.has(row.class_run_id) || historicalSessionIds.has(row.id))
    .map((row) =>
      teacher ? row : { ...row, online_url: undefined, online_url_configured: /^https:\/\//i.test(String(row.online_url || "")), pay_amount: undefined, pay_status: undefined },
    );
  const runIds = new Set(sessions.map((row) => row.class_run_id));
  const students = (arrays.students || []).filter((row) =>
    teacher ? relatedStudents.has(row.id) : row.id === actor.student_id,
  );
  const finances = teacher ? [] : (arrays.invoices || []).filter(own);
  return {
    ...data,
    students,
    sessions,
    bookings,
    attendance,
    courseLessons: (arrays.courseLessons || []).map((row) =>
      teacher
        ? row
        : { ...row, default_pay_amount: undefined, pay_amount: undefined },
    ),
    resourceBookings: (arrays.resourceBookings || []).filter(
      (row) => !teacher || ownSessionIds.has(row.class_session_id),
    ),
    runs: (arrays.runs || []).filter((row) => runIds.has(row.id) || !teacher && publishedRunIds.has(row.id)),
    enrollments: (arrays.enrollments || []).filter((row) =>
      teacher
        ? relatedStudents.has(row.student_id) && runIds.has(row.class_run_id)
        : own(row),
    ).map(row => teacher ? {
      id: row.id, student_id: row.student_id, class_run_id: row.class_run_id,
      student_name: row.student_name, status: row.status, enrolled_at: row.enrolled_at,
      delivery_mode: row.delivery_mode,
    } : row),
    invoices: finances,
    payments: teacher ? [] : (arrays.payments || []).filter(own),
    passes: teacher ? [] : (arrays.passes || []).filter(own),
    passOrders: teacher ? [] : (arrays.passOrders || []).filter(own),
    passPayments: teacher ? [] : (arrays.passPayments || []).filter(own),
    studyBookings: teacher ? [] : (arrays.studyBookings || []).filter(own),
    messages: teacher ? [] : (arrays.messages || []).filter(own),
    notifications: (arrays.notifications || []).filter(
      (row) =>
        row.recipient_type === actor.role &&
        row.recipient_id === (teacher ? actor.teacher_id : actor.student_id),
    ),
    teacherBookings: teacher
      ? (arrays.teacherBookings || []).filter(
          (row) => row.teacher_id === actor.teacher_id,
        )
      : [],
    teachers: (arrays.teachers || [])
      .filter((row) => !teacher || row.id === actor.teacher_id)
      .map((row) => (teacher ? row : { ...row, phone: "" })),
    sessionChanges: (arrays.sessionChanges || []).filter(
      (row) => !teacher || ownSessionIds.has(row.class_session_id),
    ),
    conflicts: [],
    settings: { ...(data.settings as Row), mail: {} },
    metrics: {
      openRuns: 0,
      sessionsThisWeek: sessions.length,
      activeStudents: students.length,
      outstanding: finances.reduce(
        (n, row) =>
          n + Number(row.total_amount || 0) - Number(row.paid_amount || 0),
        0,
      ),
      conflicts: 0,
    },
  };
}
