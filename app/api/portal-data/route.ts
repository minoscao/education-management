import { env } from "cloudflare:workers";

type ActionPayload = {
  action?: string;
  courseId?: string;
  sessionId?: string;
  studentId?: string;
  studentBookingId?: string;
  attendanceStatus?: string;
};

const now = "2026-07-18T09:00:00";

function db() {
  if (!env.DB) {
    throw new Error("数据库还没有连接");
  }
  return env.DB;
}

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function seed() {
  const d1 = db();
  const statements = [
    {
      sql: "INSERT OR IGNORE INTO courses (id, code, name, level, total_sessions, price, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      rows: [
        ["course-cn-y7", "CRS-001", "语文 Year 7", "Year 7", 12, 300, "started", now],
        ["course-math-y7", "CRS-002", "数学 Year 7", "Year 7", 8, 300, "open", now],
        ["course-violin-beginner", "CRS-003", "小提琴 Beginner", "Beginner", 8, 450, "started", now],
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO classrooms (id, code, name, location, capacity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      rows: [
        ["room-a201", "A-201", "A-201", "Block A Level 2", 20, "active", now],
        ["room-b102", "B-102", "B-102", "Block B Level 1", 16, "active", now],
        ["room-m301", "M-301", "M-301", "Music Block Level 3", 8, "active", now],
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO teachers (id, code, name, subject, phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      rows: [
        ["teacher-zhang", "TCH-001", "张老师", "语文", "012-8888999", "available", now],
        ["teacher-sophia", "TCH-002", "Ms Sophia", "数学", "013-1111222", "available", now],
        ["teacher-lim", "TCH-003", "Lim 老师", "小提琴", "016-3333666", "available", now],
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO students (id, code, name, level, guardian_phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      rows: [
        ["student-allen", "STU-001", "Allen Tan", "Year 7", "012-2233445", "active", now],
        ["student-may", "STU-002", "May Lee", "Year 7", "017-9988776", "active", now],
        ["student-jerry", "STU-003", "Jerry Baker", "Year 7", "013-4545454", "active", now],
        ["student-lina", "STU-004", "Lina Wong", "Year 6", "011-3344556", "active", now],
        ["student-nora", "STU-005", "Nora Lim", "Year 7", "016-7788990", "active", now],
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO course_sessions (id, course_id, session_no, title, starts_at, ends_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      rows: [
        ["session-cn-01", "course-cn-y7", 1, "基础阅读", "2026-07-18 09:00", "2026-07-18 10:30", "planned", now],
        ["session-cn-02", "course-cn-y7", 2, "写作练习", "2026-07-25 09:00", "2026-07-25 10:30", "planned", now],
        ["session-math-01", "course-math-y7", 1, "分数与小数", "2026-07-18 10:30", "2026-07-18 12:00", "planned", now],
        ["session-violin-01", "course-violin-beginner", 1, "持琴与节奏", "2026-07-22 18:00", "2026-07-22 19:00", "planned", now],
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO enrollments (id, course_id, student_id, status, created_at) VALUES (?, ?, ?, ?, ?)",
      rows: [
        ["enroll-allen-cn", "course-cn-y7", "student-allen", "enrolled", now],
        ["enroll-may-cn", "course-cn-y7", "student-may", "enrolled", now],
        ["enroll-jerry-cn", "course-cn-y7", "student-jerry", "pending_payment", now],
        ["enroll-lina-cn", "course-cn-y7", "student-lina", "enrolled", now],
        ["enroll-allen-math", "course-math-y7", "student-allen", "enrolled", now],
        ["enroll-may-violin", "course-violin-beginner", "student-may", "enrolled", now],
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO resource_bookings (id, course_session_id, resource_type, resource_id, starts_at, ends_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      rows: [
        ["rb-cn-01-room", "session-cn-01", "classroom", "room-a201", "2026-07-18 09:00", "2026-07-18 10:30", "reserved", now],
        ["rb-cn-02-room", "session-cn-02", "classroom", "room-a201", "2026-07-25 09:00", "2026-07-25 10:30", "reserved", now],
        ["rb-math-01-room", "session-math-01", "classroom", "room-b102", "2026-07-18 10:30", "2026-07-18 12:00", "reserved", now],
        ["rb-violin-01-room", "session-violin-01", "classroom", "room-m301", "2026-07-22 18:00", "2026-07-22 19:00", "reserved", now],
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO teacher_bookings (id, course_session_id, teacher_id, starts_at, ends_at, compensation_amount, compensation_status, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      rows: [
        ["tb-cn-01", "session-cn-01", "teacher-zhang", "2026-07-18 09:00", "2026-07-18 10:30", 90, "unpaid", "reserved", now],
        ["tb-cn-02", "session-cn-02", "teacher-zhang", "2026-07-25 09:00", "2026-07-25 10:30", 90, "unpaid", "reserved", now],
        ["tb-math-01", "session-math-01", "teacher-sophia", "2026-07-18 10:30", "2026-07-18 12:00", 80, "unpaid", "reserved", now],
        ["tb-violin-01", "session-violin-01", "teacher-lim", "2026-07-22 18:00", "2026-07-22 19:00", 120, "unpaid", "reserved", now],
      ],
    },
    {
      sql: "INSERT OR IGNORE INTO student_bookings (id, course_session_id, student_id, enrollment_id, starts_at, ends_at, fee_amount, payment_status, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      rows: [
        ["sb-allen-cn-01", "session-cn-01", "student-allen", "enroll-allen-cn", "2026-07-18 09:00", "2026-07-18 10:30", 25, "paid", "reserved", now],
        ["sb-may-cn-01", "session-cn-01", "student-may", "enroll-may-cn", "2026-07-18 09:00", "2026-07-18 10:30", 25, "paid", "reserved", now],
        ["sb-jerry-cn-01", "session-cn-01", "student-jerry", "enroll-jerry-cn", "2026-07-18 09:00", "2026-07-18 10:30", 25, "unpaid", "reserved", now],
        ["sb-lina-cn-01", "session-cn-01", "student-lina", "enroll-lina-cn", "2026-07-18 09:00", "2026-07-18 10:30", 25, "paid", "reserved", now],
        ["sb-allen-math-01", "session-math-01", "student-allen", "enroll-allen-math", "2026-07-18 10:30", "2026-07-18 12:00", 37.5, "paid", "reserved", now],
        ["sb-may-violin-01", "session-violin-01", "student-may", "enroll-may-violin", "2026-07-22 18:00", "2026-07-22 19:00", 56.25, "paid", "reserved", now],
      ],
    },
  ];

  for (const statement of statements) {
    for (const row of statement.rows) {
      await d1.prepare(statement.sql).bind(...row).run();
    }
  }

  await d1.prepare("UPDATE courses SET name = ? WHERE id = ?").bind("语文 Year 7", "course-cn-y7").run();
  await d1.prepare("UPDATE courses SET name = ? WHERE id = ?").bind("数学 Year 7", "course-math-y7").run();
}

async function ensureAttendanceRows() {
  const d1 = db();
  const bookings = await d1
    .prepare("SELECT id, course_session_id, student_id FROM student_bookings")
    .all<{ id: string; course_session_id: string; student_id: string }>();

  for (const booking of bookings.results ?? []) {
    await d1
      .prepare(
        "INSERT OR IGNORE INTO attendance_records (id, course_session_id, student_id, student_booking_id, status, note, marked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(`att-${booking.id}`, booking.course_session_id, booking.student_id, booking.id, "pending", "", now, now)
      .run();
  }
}

function overlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  if (aStart === "待安排" || bStart === "待安排") return false;
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

function findConflicts<T extends { id: string; starts_at: string; ends_at: string }>(
  rows: T[],
  key: (row: T) => string,
  label: (row: T) => string,
) {
  const conflicts: { type: string; title: string; detail: string }[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (key(rows[i]) === key(rows[j]) && overlap(rows[i].starts_at, rows[i].ends_at, rows[j].starts_at, rows[j].ends_at)) {
        conflicts.push({
          type: "时间冲突",
          title: key(rows[i]),
          detail: `${label(rows[i])} 与 ${label(rows[j])}`,
        });
      }
    }
  }
  return conflicts;
}

async function getPortalData() {
  await seed();
  await ensureAttendanceRows();
  const d1 = db();

  const courses = await d1
    .prepare(
      `SELECT courses.*,
        COUNT(DISTINCT course_sessions.id) AS session_count,
        COUNT(DISTINCT enrollments.student_id) AS student_count
      FROM courses
      LEFT JOIN course_sessions ON course_sessions.course_id = courses.id
      LEFT JOIN enrollments ON enrollments.course_id = courses.id
      GROUP BY courses.id
      ORDER BY courses.created_at DESC`,
    )
    .all();

  const sessions = await d1
    .prepare(
      `SELECT course_sessions.*, courses.name AS course_name, classrooms.name AS classroom_name,
        teachers.name AS teacher_name
      FROM course_sessions
      JOIN courses ON courses.id = course_sessions.course_id
      LEFT JOIN resource_bookings ON resource_bookings.course_session_id = course_sessions.id
      LEFT JOIN classrooms ON classrooms.id = resource_bookings.resource_id
      LEFT JOIN teacher_bookings ON teacher_bookings.course_session_id = course_sessions.id
      LEFT JOIN teachers ON teachers.id = teacher_bookings.teacher_id
      ORDER BY course_sessions.starts_at ASC`,
    )
    .all();

  const classrooms = await d1.prepare("SELECT * FROM classrooms ORDER BY code ASC").all();
  const teachers = await d1.prepare("SELECT * FROM teachers ORDER BY code ASC").all();
  const students = await d1.prepare("SELECT * FROM students ORDER BY code ASC").all();

  const enrollments = await d1
    .prepare(
      `SELECT enrollments.*, courses.name AS course_name, students.name AS student_name, students.guardian_phone
      FROM enrollments
      JOIN courses ON courses.id = enrollments.course_id
      JOIN students ON students.id = enrollments.student_id
      ORDER BY enrollments.created_at DESC`,
    )
    .all();

  const resourceBookings = await d1
    .prepare(
      `SELECT resource_bookings.*, courses.name AS course_name, course_sessions.title AS session_title,
        classrooms.name AS classroom_name
      FROM resource_bookings
      JOIN course_sessions ON course_sessions.id = resource_bookings.course_session_id
      JOIN courses ON courses.id = course_sessions.course_id
      JOIN classrooms ON classrooms.id = resource_bookings.resource_id
      ORDER BY resource_bookings.starts_at ASC`,
    )
    .all();

  const teacherBookings = await d1
    .prepare(
      `SELECT teacher_bookings.*, courses.name AS course_name, course_sessions.title AS session_title,
        teachers.name AS teacher_name
      FROM teacher_bookings
      JOIN course_sessions ON course_sessions.id = teacher_bookings.course_session_id
      JOIN courses ON courses.id = course_sessions.course_id
      JOIN teachers ON teachers.id = teacher_bookings.teacher_id
      ORDER BY teacher_bookings.starts_at ASC`,
    )
    .all();

  const studentBookings = await d1
    .prepare(
      `SELECT student_bookings.*, courses.name AS course_name, course_sessions.title AS session_title,
        students.name AS student_name, attendance_records.status AS attendance_status
      FROM student_bookings
      JOIN course_sessions ON course_sessions.id = student_bookings.course_session_id
      JOIN courses ON courses.id = course_sessions.course_id
      JOIN students ON students.id = student_bookings.student_id
      LEFT JOIN attendance_records ON attendance_records.student_booking_id = student_bookings.id
      ORDER BY student_bookings.starts_at ASC`,
    )
    .all();

  const attendance = await d1
    .prepare(
      `SELECT attendance_records.*, courses.name AS course_name, course_sessions.title AS session_title,
        students.name AS student_name
      FROM attendance_records
      JOIN course_sessions ON course_sessions.id = attendance_records.course_session_id
      JOIN courses ON courses.id = course_sessions.course_id
      JOIN students ON students.id = attendance_records.student_id
      ORDER BY course_sessions.starts_at ASC`,
    )
    .all();

  const resourceRows = resourceBookings.results as Array<{
    id: string;
    classroom_name: string;
    course_name: string;
    session_title: string;
    starts_at: string;
    ends_at: string;
  }>;
  const teacherRows = teacherBookings.results as Array<{
    id: string;
    teacher_name: string;
    course_name: string;
    session_title: string;
    starts_at: string;
    ends_at: string;
  }>;
  const studentRows = studentBookings.results as Array<{
    id: string;
    student_name: string;
    course_name: string;
    session_title: string;
    starts_at: string;
    ends_at: string;
  }>;

  const conflicts = [
    ...findConflicts(resourceRows, (row) => row.classroom_name, (row) => `${row.course_name} ${row.session_title}`),
    ...findConflicts(teacherRows, (row) => row.teacher_name, (row) => `${row.course_name} ${row.session_title}`),
    ...findConflicts(studentRows, (row) => row.student_name, (row) => `${row.course_name} ${row.session_title}`),
  ];

  const metrics = {
    activeCourses: (courses.results ?? []).length,
    plannedSessions: (sessions.results ?? []).length,
    students: (students.results ?? []).length,
    conflicts: conflicts.length,
    attendanceMarked: (attendance.results ?? []).filter((row: any) => row.status !== "pending").length,
  };

  return Response.json({
    courses: courses.results,
    sessions: sessions.results,
    classrooms: classrooms.results,
    teachers: teachers.results,
    students: students.results,
    enrollments: enrollments.results,
    resourceBookings: resourceBookings.results,
    teacherBookings: teacherBookings.results,
    studentBookings: studentBookings.results,
    attendance: attendance.results,
    conflicts,
    metrics,
  });
}

async function getCourseFee(courseId: string) {
  const result = await db()
    .prepare("SELECT price, total_sessions FROM courses WHERE id = ?")
    .bind(courseId)
    .first<{ price: number; total_sessions: number }>();
  if (!result?.total_sessions) return 0;
  return Math.round((Number(result.price) / Number(result.total_sessions)) * 100) / 100;
}

async function createCoursePlan() {
  const d1 = db();
  const courseId = id("course");
  await d1
    .prepare("INSERT INTO courses (id, code, name, level, total_sessions, price, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(courseId, `CRS-${Date.now().toString().slice(-4)}`, "新课程规划", "Year 7", 6, 360, "draft")
    .run();

  for (let index = 1; index <= 3; index += 1) {
    const sessionId = `${courseId}-s${index}`;
    const start = `2026-08-${String(2 + index * 7).padStart(2, "0")} 09:00`;
    const end = `2026-08-${String(2 + index * 7).padStart(2, "0")} 10:30`;
    await d1
      .prepare("INSERT INTO course_sessions (id, course_id, session_no, title, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(sessionId, courseId, index, `第 ${index} 节`, start, end, "planned")
      .run();
    await d1
      .prepare("INSERT INTO resource_bookings (id, course_session_id, resource_type, resource_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(`${sessionId}-room`, sessionId, "classroom", "room-a201", start, end, "reserved")
      .run();
    await d1
      .prepare("INSERT INTO teacher_bookings (id, course_session_id, teacher_id, starts_at, ends_at, compensation_amount, compensation_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`${sessionId}-teacher`, sessionId, "teacher-zhang", start, end, 90, "unpaid", "reserved")
      .run();
  }
}

async function duplicateCourse(courseId?: string) {
  const d1 = db();
  const source = await d1.prepare("SELECT * FROM courses WHERE id = ?").bind(courseId ?? "course-cn-y7").first<any>();
  if (!source) return;
  const newCourseId = id("copy-course");
  await d1
    .prepare("INSERT INTO courses (id, code, name, level, total_sessions, price, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newCourseId, `COPY-${Date.now().toString().slice(-4)}`, `${source.name} Copy`, source.level, source.total_sessions, source.price, "draft")
    .run();
  const sourceSessions = await d1.prepare("SELECT * FROM course_sessions WHERE course_id = ? ORDER BY session_no ASC").bind(source.id).all<any>();
  for (const session of sourceSessions.results ?? []) {
    const newSessionId = id("copy-session");
    await d1
      .prepare("INSERT INTO course_sessions (id, course_id, session_no, title, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newSessionId, newCourseId, session.session_no, session.title, "待安排", "待安排", "draft")
      .run();
  }
}

async function deleteCourse(courseId?: string) {
  if (!courseId) return;
  const d1 = db();
  const sessions = await d1.prepare("SELECT id FROM course_sessions WHERE course_id = ?").bind(courseId).all<{ id: string }>();
  for (const session of sessions.results ?? []) {
    await d1.prepare("DELETE FROM attendance_records WHERE course_session_id = ?").bind(session.id).run();
    await d1.prepare("DELETE FROM student_bookings WHERE course_session_id = ?").bind(session.id).run();
    await d1.prepare("DELETE FROM teacher_bookings WHERE course_session_id = ?").bind(session.id).run();
    await d1.prepare("DELETE FROM resource_bookings WHERE course_session_id = ?").bind(session.id).run();
  }
  await d1.prepare("DELETE FROM enrollments WHERE course_id = ?").bind(courseId).run();
  await d1.prepare("DELETE FROM course_sessions WHERE course_id = ?").bind(courseId).run();
  await d1.prepare("DELETE FROM courses WHERE id = ?").bind(courseId).run();
}

async function addSession(courseId?: string) {
  const d1 = db();
  const targetCourseId = courseId ?? "course-cn-y7";
  const count = await d1.prepare("SELECT COUNT(*) AS count FROM course_sessions WHERE course_id = ?").bind(targetCourseId).first<{ count: number }>();
  const sessionNo = Number(count?.count ?? 0) + 1;
  const sessionId = id("session");
  const start = `2026-08-${String(10 + sessionNo).padStart(2, "0")} 09:00`;
  const end = `2026-08-${String(10 + sessionNo).padStart(2, "0")} 10:30`;
  await d1
    .prepare("INSERT INTO course_sessions (id, course_id, session_no, title, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(sessionId, targetCourseId, sessionNo, `第 ${sessionNo} 节`, start, end, "planned")
    .run();
  await d1
    .prepare("INSERT INTO resource_bookings (id, course_session_id, resource_type, resource_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(`${sessionId}-room`, sessionId, "classroom", "room-a201", start, end, "reserved")
    .run();
  await d1
    .prepare("INSERT INTO teacher_bookings (id, course_session_id, teacher_id, starts_at, ends_at, compensation_amount, compensation_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(`${sessionId}-teacher`, sessionId, "teacher-zhang", start, end, 90, "unpaid", "reserved")
    .run();
}

async function enrollStudent(courseId?: string, studentId?: string) {
  const d1 = db();
  const targetCourseId = courseId ?? "course-cn-y7";
  const targetStudentId = studentId ?? "student-nora";
  const enrollmentId = `enroll-${targetStudentId}-${targetCourseId}`;
  await d1
    .prepare("INSERT OR IGNORE INTO enrollments (id, course_id, student_id, status) VALUES (?, ?, ?, ?)")
    .bind(enrollmentId, targetCourseId, targetStudentId, "enrolled")
    .run();

  const fee = await getCourseFee(targetCourseId);
  const sessions = await d1.prepare("SELECT * FROM course_sessions WHERE course_id = ?").bind(targetCourseId).all<any>();
  for (const session of sessions.results ?? []) {
    await d1
      .prepare("INSERT OR IGNORE INTO student_bookings (id, course_session_id, student_id, enrollment_id, starts_at, ends_at, fee_amount, payment_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`sb-${targetStudentId}-${session.id}`, session.id, targetStudentId, enrollmentId, session.starts_at, session.ends_at, fee, "unpaid", "reserved")
      .run();
  }
}

async function markAttendance(studentBookingId?: string, attendanceStatus?: string) {
  if (!studentBookingId) return;
  const d1 = db();
  const booking = await d1
    .prepare("SELECT course_session_id, student_id FROM student_bookings WHERE id = ?")
    .bind(studentBookingId)
    .first<{ course_session_id: string; student_id: string }>();
  if (!booking) return;
  await d1
    .prepare("INSERT OR REPLACE INTO attendance_records (id, course_session_id, student_id, student_booking_id, status, note, marked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
    .bind(`att-${studentBookingId}`, booking.course_session_id, booking.student_id, studentBookingId, attendanceStatus ?? "present", "")
    .run();
}

async function checkinAll(sessionId?: string) {
  if (!sessionId) return;
  const d1 = db();
  const bookings = await d1.prepare("SELECT id FROM student_bookings WHERE course_session_id = ?").bind(sessionId).all<{ id: string }>();
  for (const booking of bookings.results ?? []) {
    await markAttendance(booking.id, "present");
  }
}

export async function GET() {
  try {
    return await getPortalData();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await seed();
    const payload = (await request.json()) as ActionPayload;
    if (payload.action === "createCourse") await createCoursePlan();
    if (payload.action === "duplicateCourse") await duplicateCourse(payload.courseId);
    if (payload.action === "deleteCourse") await deleteCourse(payload.courseId);
    if (payload.action === "addSession") await addSession(payload.courseId);
    if (payload.action === "enrollStudent") await enrollStudent(payload.courseId, payload.studentId);
    if (payload.action === "markAttendance") await markAttendance(payload.studentBookingId, payload.attendanceStatus);
    if (payload.action === "checkinAll") await checkinAll(payload.sessionId);
    return await getPortalData();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
  }
}
