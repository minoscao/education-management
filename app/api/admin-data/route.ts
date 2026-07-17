import { env } from "cloudflare:workers";

type TableKey =
  | "courses"
  | "sessions"
  | "classrooms"
  | "students"
  | "teachers"
  | "teacherBookings"
  | "studentBookings";

const tableNames: Record<Extract<TableKey, "courses" | "classrooms" | "students" | "teachers">, string> = {
  courses: "courses",
  classrooms: "classrooms",
  students: "students",
  teachers: "teachers",
};

const now = "2026-07-17T10:00:00";

const seedStatements = [
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
    sql: "INSERT OR IGNORE INTO students (id, code, name, level, guardian_phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    rows: [
      ["student-allen", "STU-001", "Allen Tan", "Year 7", "012-2233445", "active", now],
      ["student-may", "STU-002", "May Lee", "Year 7", "017-9988776", "active", now],
      ["student-jerry", "STU-003", "Jerry Baker", "Year 7", "013-4545454", "active", now],
      ["student-lina", "STU-004", "Lina Wong", "Year 6", "011-3344556", "active", now],
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

function getBinding() {
  if (!env.DB) {
    throw new Error("数据库还没有连接。");
  }
  return env.DB;
}

async function seed() {
  const db = getBinding();
  for (const statement of seedStatements) {
    for (const row of statement.rows) {
      await db.prepare(statement.sql).bind(...row).run();
    }
  }

  await db.prepare("UPDATE teacher_bookings SET compensation_amount = 90 WHERE id IN ('tb-cn-01', 'tb-cn-02') AND compensation_amount = 0").run();
  await db.prepare("UPDATE teacher_bookings SET compensation_amount = 80 WHERE id = 'tb-math-01' AND compensation_amount = 0").run();
  await db.prepare("UPDATE teacher_bookings SET compensation_amount = 120 WHERE id = 'tb-violin-01' AND compensation_amount = 0").run();
  await db.prepare("UPDATE student_bookings SET fee_amount = 25 WHERE course_session_id IN ('session-cn-01', 'session-cn-02') AND fee_amount = 0").run();
  await db.prepare("UPDATE student_bookings SET fee_amount = 37.5 WHERE course_session_id = 'session-math-01' AND fee_amount = 0").run();
  await db.prepare("UPDATE student_bookings SET fee_amount = 56.25 WHERE course_session_id = 'session-violin-01' AND fee_amount = 0").run();
}

async function listTable(table: TableKey) {
  const db = getBinding();

  if (table === "sessions") {
    return db
      .prepare(
        `SELECT course_sessions.id, courses.name AS course, course_sessions.session_no, course_sessions.title,
          course_sessions.starts_at, course_sessions.ends_at, classrooms.name AS classroom, course_sessions.status
        FROM course_sessions
        JOIN courses ON courses.id = course_sessions.course_id
        LEFT JOIN resource_bookings ON resource_bookings.course_session_id = course_sessions.id
        LEFT JOIN classrooms ON classrooms.id = resource_bookings.resource_id
        ORDER BY course_sessions.starts_at ASC`,
      )
      .all();
  }

  if (table === "teacherBookings") {
    return db
      .prepare(
        `SELECT teacher_bookings.id, courses.name AS course, course_sessions.title AS session,
          teachers.name AS teacher, teacher_bookings.starts_at, teacher_bookings.ends_at,
          teacher_bookings.compensation_amount, teacher_bookings.compensation_status,
          teacher_bookings.status
        FROM teacher_bookings
        JOIN course_sessions ON course_sessions.id = teacher_bookings.course_session_id
        JOIN courses ON courses.id = course_sessions.course_id
        JOIN teachers ON teachers.id = teacher_bookings.teacher_id
        ORDER BY teacher_bookings.starts_at ASC`,
      )
      .all();
  }

  if (table === "studentBookings") {
    return db
      .prepare(
        `SELECT student_bookings.id, courses.name AS course, course_sessions.title AS session,
          students.name AS student, student_bookings.starts_at, student_bookings.ends_at,
          student_bookings.fee_amount, student_bookings.payment_status,
          student_bookings.status
        FROM student_bookings
        JOIN course_sessions ON course_sessions.id = student_bookings.course_session_id
        JOIN courses ON courses.id = course_sessions.course_id
        JOIN students ON students.id = student_bookings.student_id
        ORDER BY student_bookings.starts_at ASC`,
      )
      .all();
  }

  return db.prepare(`SELECT * FROM ${tableNames[table]} ORDER BY created_at DESC`).all();
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

const directColumnMap = {
  courses: new Set(["code", "name", "level", "total_sessions", "price", "status", "created_at"]),
  classrooms: new Set(["code", "name", "location", "capacity", "status", "created_at"]),
  students: new Set(["code", "name", "level", "guardian_phone", "status", "created_at"]),
  teachers: new Set(["code", "name", "subject", "phone", "status", "created_at"]),
  sessions: new Set(["session_no", "title", "starts_at", "ends_at", "status"]),
  teacherBookings: new Set(["starts_at", "ends_at", "compensation_amount", "compensation_status", "status"]),
  studentBookings: new Set(["starts_at", "ends_at", "fee_amount", "payment_status", "status"]),
} satisfies Record<TableKey, Set<string>>;

const directTableMap = {
  courses: "courses",
  classrooms: "classrooms",
  students: "students",
  teachers: "teachers",
  sessions: "course_sessions",
  teacherBookings: "teacher_bookings",
  studentBookings: "student_bookings",
} satisfies Record<TableKey, string>;

async function getCourseSessionFee(courseSessionId: string) {
  const db = getBinding();
  const result = await db
    .prepare(
      `SELECT courses.price, courses.total_sessions
      FROM course_sessions
      JOIN courses ON courses.id = course_sessions.course_id
      WHERE course_sessions.id = ?`,
    )
    .bind(courseSessionId)
    .first<{ price: number; total_sessions: number }>();

  if (!result || !result.total_sessions) return 0;
  return Math.round((Number(result.price) / Number(result.total_sessions)) * 100) / 100;
}

export async function GET() {
  try {
    await seed();
    const [courses, sessions, classrooms, students, teachers, teacherBookings, studentBookings] = await Promise.all([
      listTable("courses"),
      listTable("sessions"),
      listTable("classrooms"),
      listTable("students"),
      listTable("teachers"),
      listTable("teacherBookings"),
      listTable("studentBookings"),
    ]);

    return Response.json({
      courses: courses.results,
      sessions: sessions.results,
      classrooms: classrooms.results,
      students: students.results,
      teachers: teachers.results,
      teacherBookings: teacherBookings.results,
      studentBookings: studentBookings.results,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await seed();
    const payload = (await request.json()) as { table?: TableKey };
    const table = payload.table;
    const db = getBinding();

    if (table === "courses") {
      await db
        .prepare("INSERT INTO courses (id, code, name, level, total_sessions, price, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(nextId("course"), `CRS-${Date.now().toString().slice(-4)}`, "新课程", "Year 7", 8, 0, "draft")
        .run();
    } else if (table === "sessions") {
      await db
        .prepare("INSERT INTO course_sessions (id, course_id, session_no, title, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(nextId("session"), "course-cn-y7", 1, "新课节", "待安排", "待安排", "draft")
        .run();
    } else if (table === "classrooms") {
      await db
        .prepare("INSERT INTO classrooms (id, code, name, location, capacity, status) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(nextId("room"), `R-${Date.now().toString().slice(-4)}`, "新教室", "待设置", 10, "active")
        .run();
    } else if (table === "students") {
      await db
        .prepare("INSERT INTO students (id, code, name, level, guardian_phone, status) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(nextId("student"), `STU-${Date.now().toString().slice(-4)}`, "新学生", "Year 7", "", "active")
        .run();
    } else if (table === "teachers") {
      await db
        .prepare("INSERT INTO teachers (id, code, name, subject, phone, status) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(nextId("teacher"), `TCH-${Date.now().toString().slice(-4)}`, "新老师", "待设置", "", "available")
        .run();
    } else if (table === "teacherBookings") {
      await db
        .prepare("INSERT INTO teacher_bookings (id, course_session_id, teacher_id, starts_at, ends_at, compensation_amount, compensation_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(nextId("tb"), "session-cn-01", "teacher-zhang", "待安排", "待安排", 0, "unpaid", "draft")
        .run();
    } else if (table === "studentBookings") {
      const feeAmount = await getCourseSessionFee("session-cn-01");
      await db
        .prepare("INSERT INTO student_bookings (id, course_session_id, student_id, enrollment_id, starts_at, ends_at, fee_amount, payment_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(nextId("sb"), "session-cn-01", "student-allen", "enroll-allen-cn", "待安排", "待安排", feeAmount, "unpaid", "draft")
        .run();
    } else {
      return Response.json({ error: "未知表格" }, { status: 400 });
    }

    return GET();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "新增失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await seed();
    const payload = (await request.json()) as {
      table?: TableKey;
      id?: string;
      column?: string;
      value?: string | number | null;
    };
    const { table, id, column } = payload;
    const value = payload.value ?? "";
    const db = getBinding();

    if (!table || !id || !column) {
      return Response.json({ error: "缺少要修改的资料" }, { status: 400 });
    }

    if (directColumnMap[table]?.has(column)) {
      await db.prepare(`UPDATE ${directTableMap[table]} SET ${column} = ? WHERE id = ?`).bind(value, id).run();
      return GET();
    }

    if (table === "sessions" && column === "course") {
      await db
        .prepare(
          `UPDATE courses
          SET name = ?
          WHERE id = (SELECT course_id FROM course_sessions WHERE id = ?)`,
        )
        .bind(value, id)
        .run();
      return GET();
    }

    if (table === "sessions" && column === "classroom") {
      await db
        .prepare(
          `UPDATE classrooms
          SET name = ?
          WHERE id = (
            SELECT resource_id FROM resource_bookings
            WHERE course_session_id = ? AND resource_type = 'classroom'
            LIMIT 1
          )`,
        )
        .bind(value, id)
        .run();
      return GET();
    }

    if (table === "teacherBookings" && column === "course") {
      await db
        .prepare(
          `UPDATE courses
          SET name = ?
          WHERE id = (
            SELECT course_sessions.course_id
            FROM teacher_bookings
            JOIN course_sessions ON course_sessions.id = teacher_bookings.course_session_id
            WHERE teacher_bookings.id = ?
          )`,
        )
        .bind(value, id)
        .run();
      return GET();
    }

    if (table === "teacherBookings" && column === "session") {
      await db
        .prepare(
          `UPDATE course_sessions
          SET title = ?
          WHERE id = (SELECT course_session_id FROM teacher_bookings WHERE id = ?)`,
        )
        .bind(value, id)
        .run();
      return GET();
    }

    if (table === "teacherBookings" && column === "teacher") {
      await db
        .prepare(
          `UPDATE teachers
          SET name = ?
          WHERE id = (SELECT teacher_id FROM teacher_bookings WHERE id = ?)`,
        )
        .bind(value, id)
        .run();
      return GET();
    }

    if (table === "studentBookings" && column === "course") {
      await db
        .prepare(
          `UPDATE courses
          SET name = ?
          WHERE id = (
            SELECT course_sessions.course_id
            FROM student_bookings
            JOIN course_sessions ON course_sessions.id = student_bookings.course_session_id
            WHERE student_bookings.id = ?
          )`,
        )
        .bind(value, id)
        .run();
      return GET();
    }

    if (table === "studentBookings" && column === "session") {
      await db
        .prepare(
          `UPDATE course_sessions
          SET title = ?
          WHERE id = (SELECT course_session_id FROM student_bookings WHERE id = ?)`,
        )
        .bind(value, id)
        .run();
      return GET();
    }

    if (table === "studentBookings" && column === "student") {
      await db
        .prepare(
          `UPDATE students
          SET name = ?
          WHERE id = (SELECT student_id FROM student_bookings WHERE id = ?)`,
        )
        .bind(value, id)
        .run();
      return GET();
    }

    return Response.json({ error: "这个字段暂时不能修改" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "修改失败" }, { status: 500 });
  }
}
