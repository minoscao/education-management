import { env } from "cloudflare:workers";

type Row = Record<string, unknown>;

type ActionPayload = {
  action?: string;
  courseId?: string;
  runId?: string;
  sessionId?: string;
  studentId?: string;
  studentBookingId?: string;
  invoiceId?: string;
  title?: string;
  subject?: string;
  level?: string;
  sessions?: number | string;
  minutes?: number | string;
  price?: number | string;
  color?: string;
  name?: string;
  termId?: string;
  capacity?: number | string;
  topic?: string;
  startsAt?: string;
  endsAt?: string;
  classroomId?: string;
  teacherId?: string;
  payAmount?: number | string;
  amount?: number | string;
  attendanceStatus?: string;
  note?: string;
  phone?: string;
  location?: string;
  roomType?: string;
  resources?: string;
  mapX?: number | string;
  mapY?: number | string;
  mapWidth?: number | string;
  mapHeight?: number | string;
};

function db() {
  if (!env.DB) throw new Error("Database connection is unavailable.");
  return env.DB;
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const courseColours = ["#0F8AA8", "#2563EB", "#4F46E5", "#7C3AED", "#0F766E", "#16A34A", "#A21CAF"];
const defaultCourseColour = courseColours[0];

function courseColour(value: unknown) {
  const selected = String(value ?? "").toUpperCase();
  return courseColours.includes(selected) ? selected : defaultCourseColour;
}

function localDate(offsetDays = 0, time = "09:00") {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${time}`;
}

function later(start: string, minutes: number) {
  const date = new Date(start.replace(" ", "T"));
  date.setMinutes(date.getMinutes() + minutes);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart.replace(" ", "T")).getTime() < new Date(bEnd.replace(" ", "T")).getTime()
    && new Date(bStart.replace(" ", "T")).getTime() < new Date(aEnd.replace(" ", "T")).getTime();
}

async function rows<T extends Row = Row>(sql: string, values: unknown[] = []) {
  const result = await db().prepare(sql).bind(...values).all<T>();
  return result.results ?? [];
}

async function row<T extends Row = Row>(sql: string, values: unknown[] = []) {
  return db().prepare(sql).bind(...values).first<T>();
}

async function execute(sql: string, values: unknown[] = []) {
  return db().prepare(sql).bind(...values).run();
}

async function seedDatabase() {
  const seeded = await row<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", ["v2_seeded"]);
  if (seeded) {
    await ensureClassroomLayouts();
    await ensureCourseColours();
    await ensureOperationalSampleData();
    return;
  }

  const today = localDate(0, "00:00").slice(0, 10);
  const termId = "term-current";
  const products = [
    ["course-chinese-y7", "CHN-Y7", "Chinese Year 7", "Chinese", "Year 7", 12, 90, 360, "#0F766E", "active"],
    ["course-math-y7", "MTH-Y7", "Mathematics Year 7", "Mathematics", "Year 7", 12, 90, 420, "#2563EB", "active"],
    ["course-violin-beg", "VIO-BEG", "Violin Beginner", "Music", "Beginner", 8, 60, 480, "#7C3AED", "active"],
  ];
  const teachers = [
    ["teacher-zhang", "TCH-001", "Zhang Teacher", "Chinese", "012-8888999", "available"],
    ["teacher-sophia", "TCH-002", "Ms Sophia", "Mathematics", "013-1111222", "available"],
    ["teacher-lim", "TCH-003", "Lim Teacher", "Music", "016-3333666", "available"],
  ];
  const students = [
    ["student-allen", "STU-001", "Allen Tan", "Year 7", "012-2233445", "active"],
    ["student-may", "STU-002", "May Lee", "Year 7", "017-9988776", "active"],
    ["student-jerry", "STU-003", "Jerry Baker", "Year 7", "013-4545454", "active"],
    ["student-lina", "STU-004", "Lina Wong", "Year 6", "011-3344556", "active"],
  ];
  const classrooms = [
    ["room-a201", "A-201", "A-201", "Block A, Level 2", 20, "active"],
    ["room-b102", "B-102", "B-102", "Block B, Level 1", 16, "active"],
    ["room-m301", "M-301", "M-301", "Music Block, Level 3", 8, "active"],
  ];

  for (const teacher of teachers) {
    await execute("INSERT OR IGNORE INTO teachers (id, code, name, subject, phone, status) VALUES (?, ?, ?, ?, ?, ?)", teacher);
  }
  for (const student of students) {
    await execute("INSERT OR IGNORE INTO students (id, code, name, level, guardian_phone, status) VALUES (?, ?, ?, ?, ?, ?)", student);
  }
  for (const classroom of classrooms) {
    await execute("INSERT OR IGNORE INTO classrooms (id, code, name, location, capacity, status) VALUES (?, ?, ?, ?, ?, ?)", classroom);
  }
  await ensureClassroomLayouts();
  await execute(
    "INSERT OR IGNORE INTO academic_terms (id, code, name, starts_on, ends_on, status) VALUES (?, ?, ?, ?, ?, ?)",
    [termId, `TERM-${today.slice(0, 4)}-CURRENT`, "Current Term", today, localDate(120, "00:00").slice(0, 10), "active"],
  );
  for (const product of products) {
    await execute(
      "INSERT OR IGNORE INTO course_catalogs (id, code, title, subject, level, default_sessions, default_minutes, list_price, display_color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      product,
    );
  }

  const runs = [
    ["run-chinese-y7-a", "CHN-Y7-2026-A", "course-chinese-y7", termId, "Chinese Year 7 - Saturday AM", 16, 360, "open"],
    ["run-math-y7-a", "MTH-Y7-2026-A", "course-math-y7", termId, "Mathematics Year 7 - Saturday AM", 16, 420, "open"],
    ["run-violin-beg-a", "VIO-BEG-2026-A", "course-violin-beg", termId, "Violin Beginner - Tuesday PM", 6, 480, "open"],
  ];
  for (const run of runs) {
    await execute(
      "INSERT OR IGNORE INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [...run, localDate(-14), localDate(28)],
    );
  }

  const sessionSeeds = [
    ["session-chinese-01", "run-chinese-y7-a", 1, "Reading foundations", localDate(1, "09:00"), localDate(1, "10:30"), "room-a201", "teacher-zhang", 90],
    ["session-chinese-02", "run-chinese-y7-a", 2, "Writing practice", localDate(8, "09:00"), localDate(8, "10:30"), "room-a201", "teacher-zhang", 90],
    ["session-math-01", "run-math-y7-a", 1, "Fractions and decimals", localDate(1, "10:30"), localDate(1, "12:00"), "room-b102", "teacher-sophia", 85],
    ["session-violin-01", "run-violin-beg-a", 1, "Posture and rhythm", localDate(4, "18:00"), localDate(4, "19:00"), "room-m301", "teacher-lim", 120],
  ];
  for (const [sessionId, runId, sessionNo, topic, startsAt, endsAt, classroomId, teacherId, payAmount] of sessionSeeds) {
    await execute(
      "INSERT OR IGNORE INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [sessionId, runId, sessionNo, topic, startsAt, endsAt, "scheduled"],
    );
    await execute(
      "INSERT OR IGNORE INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?)",
      [`rb-${sessionId}`, sessionId, classroomId, startsAt, endsAt, "reserved"],
    );
    await execute(
      "INSERT OR IGNORE INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [`tb-${sessionId}`, sessionId, teacherId, startsAt, endsAt, payAmount, "unpaid", "confirmed"],
    );
  }

  await enrollStudent("run-chinese-y7-a", "student-allen", 360, false);
  await enrollStudent("run-chinese-y7-a", "student-may", 360, false);
  await enrollStudent("run-math-y7-a", "student-allen", 420, false);
  await enrollStudent("run-violin-beg-a", "student-may", 480, false);
  await ensureCourseColours();
  await ensureOperationalSampleData();
  await execute("INSERT INTO app_settings (key, value) VALUES (?, ?)", ["v2_seeded", "true"]);
}

async function ensureClassroomLayouts() {
  const layouts = [
    ["classroom", "Whiteboard, projector", 70, 86, 190, 116, "room-a201"],
    ["classroom", "Whiteboard, projector", 315, 86, 182, 116, "room-b102"],
    ["music room", "Music stands, keyboard", 177, 274, 210, 118, "room-m301"],
  ];
  for (const layout of layouts) {
    await execute(
      "UPDATE classrooms SET room_type = ?, resources = ?, map_x = ?, map_y = ?, map_width = ?, map_height = ? WHERE id = ? AND map_x = 80 AND map_y = 80",
      layout,
    );
  }
}

async function ensureCourseColours() {
  const presets = [
    ["#0F766E", "course-chinese-y7"],
    ["#2563EB", "course-math-y7"],
    ["#7C3AED", "course-violin-beg"],
  ];
  for (const [color, courseId] of presets) {
    await execute("UPDATE course_catalogs SET display_color = ? WHERE id = ? AND display_color = ?", [color, courseId, defaultCourseColour]);
  }
}

async function ensureOperationalSampleData() {
  let stage = "base records";
  try {
  const termId = "term-current";
  const teachers = [
    ["teacher-olivia", "TCH-004", "Ms Olivia", "English", "014-5550134", "available"],
    ["teacher-farid", "TCH-005", "Mr Farid", "English", "019-5550188", "available"],
  ];
  const students = [
    ["student-aisha", "STU-011", "Aisha Rahman", "Year 7", "012-5551005", "active"],
    ["student-daniel", "STU-006", "Daniel Wong", "Year 7", "012-5551006", "active"],
    ["student-yuna", "STU-007", "Yuna Lim", "Year 7", "012-5551007", "active"],
    ["student-adam", "STU-008", "Adam Lee", "Year 6", "012-5551008", "active"],
    ["student-sara", "STU-009", "Sara Tan", "Year 7", "012-5551009", "active"],
    ["student-noah", "STU-010", "Noah Chen", "Year 7", "012-5551010", "active"],
  ];
  const courses = [
    ["course-english-y7", "ENG-Y7", "English Year 7", "English", "Year 7", 12, 90, 390, "#4F46E5", "active"],
  ];

  for (const teacher of teachers) {
    await execute("INSERT OR IGNORE INTO teachers (id, code, name, subject, phone, status) VALUES (?, ?, ?, ?, ?, ?)", teacher);
  }
  for (const student of students) {
    await execute("INSERT OR IGNORE INTO students (id, code, name, level, guardian_phone, status) VALUES (?, ?, ?, ?, ?, ?)", student);
  }
  for (const course of courses) {
    await execute(
      "INSERT OR IGNORE INTO course_catalogs (id, code, title, subject, level, default_sessions, default_minutes, list_price, display_color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      course,
    );
  }
  await execute("UPDATE course_catalogs SET default_sessions = ? WHERE id = ?", [12, "course-math-y7"]);
  await execute(
    "INSERT OR IGNORE INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["run-english-y7-a", "ENG-Y7-2026-A", "course-english-y7", termId, "English Year 7 - Wednesday PM", 18, 390, "open", localDate(-14), localDate(28)],
  );

  const chineseTopics = [
    "Reading foundations", "Writing practice", "Vocabulary in context", "Informative texts", "Sentence structure", "Narrative writing",
    "Reading comprehension", "Grammar review", "Speaking practice", "Persuasive writing", "Revision workshop", "Term assessment",
  ];
  const mathematicsTopics = [
    "Fractions and decimals", "Equivalent fractions", "Decimal operations", "Percentages", "Ratio and proportion", "Algebraic expressions",
    "Linear equations", "Geometry: angles", "Perimeter and area", "Data handling", "Problem-solving strategies", "Maths revision",
  ];
  const englishTopics = [
    "Reading for meaning", "Vocabulary and word families", "Sentence crafting", "Narrative structure", "Descriptive writing", "Grammar in use",
    "Speaking and listening", "Informative writing", "Comprehension strategies", "Editing workshop", "Presentation skills", "English revision",
  ];
  const violinTopics = [
    "Posture and rhythm", "Bow control", "Open strings", "First finger notes", "Simple melodies", "Dynamics", "Ensemble practice", "Performance review",
  ];
  stage = "class schedules";
  const sessionSeeds: [string, string, number, string, string, string, string, string, number][] = [];
  const schedule = (runId: string, prefix: string, topics: string[], offset: number, time: string, roomId: string, teacherId: string, pay: number) => {
    topics.forEach((topic, index) => {
      const startsAt = localDate(offset + index * 7, time);
      sessionSeeds.push([`${prefix}-${String(index + 1).padStart(2, "0")}`, runId, index + 1, topic, startsAt, later(startsAt, prefix === "session-violin" ? 60 : 90), roomId, teacherId, pay]);
    });
  };
  schedule("run-chinese-y7-a", "session-chinese", chineseTopics, 1, "09:00", "room-a201", "teacher-zhang", 90);
  schedule("run-math-y7-a", "session-math", mathematicsTopics, 1, "10:30", "room-b102", "teacher-sophia", 85);
  schedule("run-english-y7-a", "session-english", englishTopics, 4, "16:00", "room-a201", "teacher-olivia", 90);
  schedule("run-violin-beg-a", "session-violin", violinTopics, 4, "18:00", "room-m301", "teacher-lim", 120);

  for (const [sessionId, runId, sessionNo, topic, startsAt, endsAt, classroomId, teacherId, payAmount] of sessionSeeds) {
    await execute(
      "INSERT OR IGNORE INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [sessionId, runId, sessionNo, topic, startsAt, endsAt, "scheduled"],
    );
    await execute(
      "INSERT OR IGNORE INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?)",
      [`rb-${sessionId}`, sessionId, classroomId, startsAt, endsAt, "reserved"],
    );
    await execute(
      "INSERT OR IGNORE INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [`tb-${sessionId}`, sessionId, teacherId, startsAt, endsAt, payAmount, "unpaid", "confirmed"],
    );
  }

  stage = "mathematics enrolments";
  await ensureEnrollment("run-math-y7-a", "student-may", 420);
  await ensureEnrollment("run-math-y7-a", "student-jerry", 420);
  await ensureEnrollment("run-math-y7-a", "student-aisha", 420);
  await ensureEnrollment("run-math-y7-a", "student-daniel", 420);
  stage = "english enrolments";
  await ensureEnrollment("run-english-y7-a", "student-allen", 390);
  await ensureEnrollment("run-english-y7-a", "student-jerry", 390);
  await ensureEnrollment("run-english-y7-a", "student-lina", 390);
  await ensureEnrollment("run-english-y7-a", "student-yuna", 390);
  await ensureEnrollment("run-english-y7-a", "student-sara", 390);
  await ensureEnrollment("run-english-y7-a", "student-noah", 390);
  stage = "lesson booking backfill";
  await ensureEnrollmentBookings("run-chinese-y7-a");
  await ensureEnrollmentBookings("run-math-y7-a");
  await ensureEnrollmentBookings("run-english-y7-a");
  await ensureEnrollmentBookings("run-violin-beg-a");
  } catch (error) {
    throw new Error(`Operational sample data failed during ${stage}: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function ensureEnrollment(runId: string, studentId: string, contractedFee: number) {
  const existing = await row("SELECT id FROM class_enrollments WHERE class_run_id = ? AND student_id = ?", [runId, studentId]);
  if (!existing) await enrollStudent(runId, studentId, contractedFee, false);
}

async function ensureEnrollmentBookings(runId: string) {
  const sessions = await rows<{ id: string }>("SELECT id FROM class_sessions WHERE class_run_id = ? ORDER BY session_no", [runId]);
  const enrollments = await rows<{ id: string; student_id: string; contracted_fee: number }>(
    "SELECT id, student_id, contracted_fee FROM class_enrollments WHERE class_run_id = ? AND status = 'enrolled'",
    [runId],
  );
  for (const enrollment of enrollments) {
    const allocated = sessions.length ? Math.round((number(enrollment.contracted_fee) / sessions.length) * 100) / 100 : 0;
    await execute("UPDATE class_student_bookings SET allocated_fee = ? WHERE enrollment_id = ?", [allocated, enrollment.id]);
    for (const session of sessions) {
      const booking = await row("SELECT id FROM class_student_bookings WHERE class_session_id = ? AND enrollment_id = ?", [session.id, enrollment.id]);
      if (booking) continue;
      const bookingId = `sample-sb-${enrollment.id}-${session.id}`;
      await execute(
        "INSERT OR IGNORE INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status) VALUES (?, ?, ?, ?, ?, ?)",
        [bookingId, session.id, enrollment.id, enrollment.student_id, allocated, "booked"],
      );
      await execute("INSERT OR IGNORE INTO class_attendance (id, student_booking_id, status, note) VALUES (?, ?, ?, ?)", [`sample-att-${bookingId}`, bookingId, "pending", ""]);
    }
  }
}

async function conflictExists(kind: "classroom" | "teacher" | "student", entityId: string, startsAt: string, endsAt: string) {
  const sources = {
    classroom: ["class_resource_bookings", "classroom_id"],
    teacher: ["class_teacher_bookings", "teacher_id"],
    student: ["class_student_bookings", "student_id"],
  } as const;
  const [table, column] = sources[kind];
  const sql = kind === "student"
    ? `SELECT class_sessions.starts_at, class_sessions.ends_at
       FROM ${table} JOIN class_sessions ON class_sessions.id = ${table}.class_session_id
       WHERE ${table}.${column} = ? AND ${table}.status != 'cancelled'`
    : `SELECT starts_at, ends_at FROM ${table} WHERE ${column} = ? AND status != 'cancelled'`;
  const existing = await rows<{ starts_at: string; ends_at: string }>(sql, [entityId]);
  return existing.some((item) => overlaps(startsAt, endsAt, item.starts_at, item.ends_at));
}

async function createCourse(payload: ActionPayload) {
  const title = payload.title?.trim() || "New course";
  const count = Math.max(1, Math.floor(number(payload.sessions, 8)));
  const code = `CRS-${Date.now().toString().slice(-6)}`;
  await execute(
    "INSERT INTO course_catalogs (id, code, title, subject, level, default_sessions, default_minutes, list_price, display_color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id("course"), code, title, payload.subject?.trim() || "General", payload.level?.trim() || "Mixed", count, Math.max(30, number(payload.minutes, 90)), number(payload.price), courseColour(payload.color), "active"],
  );
}

async function createClassRun(payload: ActionPayload) {
  if (!payload.courseId || !payload.termId) throw new Error("Please select a course and term.");
  const course = await row<{ title: string; list_price: number }>("SELECT title, list_price FROM course_catalogs WHERE id = ?", [payload.courseId]);
  if (!course) throw new Error("Course not found.");
  const code = `RUN-${Date.now().toString().slice(-6)}`;
  await execute(
    "INSERT INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id("run"), code, payload.courseId, payload.termId, payload.name?.trim() || `${course.title} class`, Math.max(1, Math.floor(number(payload.capacity, 16))), number(payload.price, course.list_price), "open", localDate(-1), localDate(30)],
  );
}

async function createSession(payload: ActionPayload) {
  if (!payload.runId || !payload.classroomId || !payload.teacherId) throw new Error("Please select class, classroom and teacher.");
  const run = await row<{ default_minutes: number }>(
    `SELECT course_catalogs.default_minutes FROM class_runs
     JOIN course_catalogs ON course_catalogs.id = class_runs.course_id WHERE class_runs.id = ?`,
    [payload.runId],
  );
  if (!run) throw new Error("Class not found.");
  const startsAt = payload.startsAt?.replace("T", " ") || localDate(7, "09:00");
  const endsAt = payload.endsAt?.replace("T", " ") || later(startsAt, run.default_minutes);
  if (new Date(startsAt.replace(" ", "T")) >= new Date(endsAt.replace(" ", "T"))) throw new Error("End time must be later than start time.");
  if (await conflictExists("classroom", payload.classroomId, startsAt, endsAt)) throw new Error("This classroom is already booked for that time.");
  if (await conflictExists("teacher", payload.teacherId, startsAt, endsAt)) throw new Error("This teacher is already booked for that time.");
  const enrollments = await rows<{ id: string; student_id: string; contracted_fee: number; student_name: string }>(
    `SELECT class_enrollments.id, class_enrollments.student_id, class_enrollments.contracted_fee, students.name AS student_name
     FROM class_enrollments JOIN students ON students.id = class_enrollments.student_id
     WHERE class_enrollments.class_run_id = ? AND class_enrollments.status = 'enrolled'`,
    [payload.runId],
  );
  for (const enrollment of enrollments) {
    if (await conflictExists("student", enrollment.student_id, startsAt, endsAt)) {
      throw new Error(`${enrollment.student_name} is already booked for this time.`);
    }
  }

  const next = await row<{ next_no: number }>("SELECT COALESCE(MAX(session_no), 0) + 1 AS next_no FROM class_sessions WHERE class_run_id = ?", [payload.runId]);
  const sessionId = id("session");
  await execute(
    "INSERT INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [sessionId, payload.runId, next?.next_no ?? 1, payload.topic?.trim() || `Lesson ${next?.next_no ?? 1}`, startsAt, endsAt, "scheduled"],
  );
  await execute(
    "INSERT INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?)",
    [id("room-booking"), sessionId, payload.classroomId, startsAt, endsAt, "reserved"],
  );
  await execute(
    "INSERT INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id("teacher-booking"), sessionId, payload.teacherId, startsAt, endsAt, number(payload.payAmount), "unpaid", "confirmed"],
  );

  const totalSessions = await row<{ count: number }>("SELECT COUNT(*) AS count FROM class_sessions WHERE class_run_id = ?", [payload.runId]);
  for (const enrollment of enrollments) {
    const bookingId = id("student-booking");
    const allocated = Math.round((number(enrollment.contracted_fee) / Math.max(1, number(totalSessions?.count))) * 100) / 100;
    // A class price is fixed at enrollment. When its schedule grows, redistribute
    // that same contracted fee across every booked lesson rather than charging more.
    await execute("UPDATE class_student_bookings SET allocated_fee = ? WHERE enrollment_id = ?", [allocated, enrollment.id]);
    await execute(
      "INSERT INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status) VALUES (?, ?, ?, ?, ?, ?)",
      [bookingId, sessionId, enrollment.id, enrollment.student_id, allocated, "booked"],
    );
    await execute("INSERT INTO class_attendance (id, student_booking_id, status, note) VALUES (?, ?, ?, ?)", [id("attendance"), bookingId, "pending", ""]);
  }
}

async function enrollStudent(runId?: string, studentId?: string, contractedFee?: number, checkCapacity = true) {
  if (!runId || !studentId) throw new Error("Please select a class and student.");
  const run = await row<{ capacity: number; price: number; enrolled: number }>(
    `SELECT class_runs.capacity, class_runs.price, COUNT(class_enrollments.id) AS enrolled
     FROM class_runs LEFT JOIN class_enrollments ON class_enrollments.class_run_id = class_runs.id
     AND class_enrollments.status = 'enrolled' WHERE class_runs.id = ? GROUP BY class_runs.id`,
    [runId],
  );
  if (!run) throw new Error("Class not found.");
  if (checkCapacity && number(run.enrolled) >= number(run.capacity)) throw new Error("This class is full.");
  const existing = await row("SELECT id FROM class_enrollments WHERE class_run_id = ? AND student_id = ?", [runId, studentId]);
  if (existing) throw new Error("This student is already enrolled in the class.");

  const enrollmentId = id("enrollment");
  const fee = contractedFee ?? number(run.price);
  await execute(
    "INSERT INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, enrolled_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
    [enrollmentId, runId, studentId, fee, "enrolled"],
  );
  const sessions = await rows<{ id: string; starts_at: string; ends_at: string }>("SELECT id, starts_at, ends_at FROM class_sessions WHERE class_run_id = ? ORDER BY session_no", [runId]);
  for (const session of sessions) {
    if (await conflictExists("student", studentId, session.starts_at, session.ends_at)) {
      await execute("DELETE FROM class_enrollments WHERE id = ?", [enrollmentId]);
      throw new Error("This student already has another class at one of the scheduled times.");
    }
  }
  const allocated = sessions.length ? Math.round((fee / sessions.length) * 100) / 100 : 0;
  for (const session of sessions) {
    const bookingId = id("student-booking");
    await execute(
      "INSERT INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status) VALUES (?, ?, ?, ?, ?, ?)",
      [bookingId, session.id, enrollmentId, studentId, allocated, "booked"],
    );
    await execute("INSERT INTO class_attendance (id, student_booking_id, status, note) VALUES (?, ?, ?, ?)", [id("attendance"), bookingId, "pending", ""]);
  }
  const invoiceId = id("invoice");
  await execute(
    "INSERT INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
    [invoiceId, `INV-${Date.now().toString().slice(-7)}`, enrollmentId, studentId, fee, 0, "unpaid", localDate(14, "00:00").slice(0, 10)],
  );
}

async function recordPayment(payload: ActionPayload) {
  if (!payload.invoiceId) throw new Error("Invoice not found.");
  const invoice = await row<{ id: string; student_id: string; enrollment_id: string; total_amount: number; paid_amount: number }>(
    "SELECT id, student_id, enrollment_id, total_amount, paid_amount FROM student_invoices WHERE id = ?", [payload.invoiceId],
  );
  if (!invoice) throw new Error("Invoice not found.");
  const remaining = Math.max(0, number(invoice.total_amount) - number(invoice.paid_amount));
  const amount = Math.min(Math.max(0.01, number(payload.amount, remaining)), remaining);
  const paid = Math.round((number(invoice.paid_amount) + amount) * 100) / 100;
  const status = paid >= number(invoice.total_amount) ? "paid" : "partly_paid";
  await execute("INSERT INTO student_payments (id, invoice_id, student_id, amount, method, received_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)", [id("payment"), invoice.id, invoice.student_id, amount, "bank_transfer"]);
  await execute("UPDATE student_invoices SET paid_amount = ?, status = ? WHERE id = ?", [paid, status, invoice.id]);
}

async function setAttendance(payload: ActionPayload) {
  if (!payload.studentBookingId) throw new Error("Student booking not found.");
  await execute(
    "UPDATE class_attendance SET status = ?, note = ?, marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?",
    [payload.attendanceStatus ?? "present", payload.note?.trim() ?? "", payload.studentBookingId],
  );
}

async function updateEntity(payload: ActionPayload) {
  if (payload.action === "updateCourse" && payload.courseId) {
    await execute("UPDATE course_catalogs SET title = ?, subject = ?, level = ?, default_sessions = ?, default_minutes = ?, list_price = ?, display_color = ? WHERE id = ?", [payload.title?.trim() || "Untitled course", payload.subject?.trim() || "General", payload.level?.trim() || "Mixed", Math.max(1, number(payload.sessions, 1)), Math.max(30, number(payload.minutes, 30)), number(payload.price), courseColour(payload.color), payload.courseId]);
  }
  if (payload.action === "updateRun" && payload.runId) {
    await execute("UPDATE class_runs SET name = ?, capacity = ?, price = ? WHERE id = ?", [payload.name?.trim() || "Untitled class", Math.max(1, number(payload.capacity, 1)), number(payload.price), payload.runId]);
  }
}

async function createBaseRecord(payload: ActionPayload) {
  const label = payload.name?.trim() || "Untitled";
  if (payload.action === "createStudent") {
    await execute(
      "INSERT INTO students (id, code, name, level, guardian_phone, status) VALUES (?, ?, ?, ?, ?, ?)",
      [id("student"), `STU-${Date.now().toString().slice(-6)}`, label, payload.level?.trim() || "Unassigned", payload.phone?.trim() || "", "active"],
    );
  }
  if (payload.action === "createTeacher") {
    await execute(
      "INSERT INTO teachers (id, code, name, subject, phone, status) VALUES (?, ?, ?, ?, ?, ?)",
      [id("teacher"), `TCH-${Date.now().toString().slice(-6)}`, label, payload.subject?.trim() || "General", payload.phone?.trim() || "", "available"],
    );
  }
  if (payload.action === "createClassroom") {
    await execute(
      "INSERT INTO classrooms (id, code, name, location, capacity, room_type, resources, map_x, map_y, map_width, map_height, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id("room"), `ROOM-${Date.now().toString().slice(-5)}`, label, payload.location?.trim() || "Main campus", Math.max(1, Math.floor(number(payload.capacity, 12))), payload.roomType?.trim() || "classroom", payload.resources?.trim() || "", 80, 80, 180, 110, "active"],
    );
  }
}

async function updateClassroomMap(payload: ActionPayload) {
  if (!payload.classroomId) throw new Error("Classroom not found.");
  await execute(
    "UPDATE classrooms SET map_x = ?, map_y = ?, map_width = ?, map_height = ?, room_type = ?, resources = ? WHERE id = ?",
    [
      Math.max(0, Math.round(number(payload.mapX, 80))),
      Math.max(0, Math.round(number(payload.mapY, 80))),
      Math.max(80, Math.round(number(payload.mapWidth, 180))),
      Math.max(60, Math.round(number(payload.mapHeight, 110))),
      payload.roomType?.trim() || "classroom",
      payload.resources?.trim() || "",
      payload.classroomId,
    ],
  );
}

async function readPortal() {
  await seedDatabase();
  const [terms, courses, runs, sessions, students, teachers, classrooms, enrollments, invoices, payments, attendance, resourceBookings, teacherBookings] = await Promise.all([
    rows("SELECT * FROM academic_terms ORDER BY starts_on DESC"),
    rows(`SELECT course_catalogs.*, COUNT(DISTINCT class_runs.id) AS run_count FROM course_catalogs LEFT JOIN class_runs ON class_runs.course_id = course_catalogs.id GROUP BY course_catalogs.id ORDER BY course_catalogs.code`),
    rows(`SELECT class_runs.*, course_catalogs.title AS course_title, course_catalogs.subject, academic_terms.name AS term_name, COUNT(DISTINCT class_sessions.id) AS session_count, COUNT(DISTINCT class_enrollments.id) AS student_count
          FROM class_runs JOIN course_catalogs ON course_catalogs.id = class_runs.course_id JOIN academic_terms ON academic_terms.id = class_runs.term_id
          LEFT JOIN class_sessions ON class_sessions.class_run_id = class_runs.id LEFT JOIN class_enrollments ON class_enrollments.class_run_id = class_runs.id AND class_enrollments.status = 'enrolled'
          GROUP BY class_runs.id ORDER BY class_runs.created_at DESC`),
    rows(`SELECT class_sessions.*, class_runs.name AS run_name, class_runs.code AS run_code, course_catalogs.title AS course_title, course_catalogs.display_color AS course_color, classrooms.name AS classroom_name, teachers.name AS teacher_name, class_teacher_bookings.pay_amount AS pay_amount, class_teacher_bookings.pay_status
          FROM class_sessions JOIN class_runs ON class_runs.id = class_sessions.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id
          LEFT JOIN class_resource_bookings ON class_resource_bookings.class_session_id = class_sessions.id LEFT JOIN classrooms ON classrooms.id = class_resource_bookings.classroom_id
          LEFT JOIN class_teacher_bookings ON class_teacher_bookings.class_session_id = class_sessions.id LEFT JOIN teachers ON teachers.id = class_teacher_bookings.teacher_id
          ORDER BY class_sessions.starts_at ASC`),
    rows("SELECT * FROM students ORDER BY code"),
    rows("SELECT * FROM teachers ORDER BY code"),
    rows("SELECT * FROM classrooms ORDER BY code"),
    rows(`SELECT class_enrollments.*, students.name AS student_name, students.guardian_phone, class_runs.name AS run_name, class_runs.code AS run_code, course_catalogs.title AS course_title, student_invoices.id AS invoice_id, student_invoices.invoice_no, student_invoices.total_amount, student_invoices.paid_amount, student_invoices.status AS invoice_status
          FROM class_enrollments JOIN students ON students.id = class_enrollments.student_id JOIN class_runs ON class_runs.id = class_enrollments.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id
          LEFT JOIN student_invoices ON student_invoices.enrollment_id = class_enrollments.id ORDER BY class_enrollments.enrolled_at DESC`),
    rows(`SELECT student_invoices.*, students.name AS student_name, class_runs.name AS run_name, course_catalogs.title AS course_title
          FROM student_invoices JOIN students ON students.id = student_invoices.student_id JOIN class_enrollments ON class_enrollments.id = student_invoices.enrollment_id JOIN class_runs ON class_runs.id = class_enrollments.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id ORDER BY student_invoices.issued_at DESC`),
    rows("SELECT student_payments.*, student_invoices.invoice_no, students.name AS student_name FROM student_payments JOIN student_invoices ON student_invoices.id = student_payments.invoice_id JOIN students ON students.id = student_payments.student_id ORDER BY student_payments.received_at DESC"),
    rows(`SELECT class_attendance.*, class_student_bookings.class_session_id, class_student_bookings.student_id, class_student_bookings.allocated_fee, students.name AS student_name, class_sessions.topic, class_sessions.starts_at, class_sessions.ends_at, class_runs.name AS run_name, course_catalogs.title AS course_title, course_catalogs.display_color AS course_color
          FROM class_attendance JOIN class_student_bookings ON class_student_bookings.id = class_attendance.student_booking_id JOIN students ON students.id = class_student_bookings.student_id
          JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id JOIN class_runs ON class_runs.id = class_sessions.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id ORDER BY class_sessions.starts_at ASC`),
    rows(`SELECT class_resource_bookings.*, classrooms.name AS classroom_name, class_sessions.topic, class_sessions.starts_at AS session_starts_at, class_runs.name AS run_name, course_catalogs.title AS course_title
          FROM class_resource_bookings JOIN classrooms ON classrooms.id = class_resource_bookings.classroom_id JOIN class_sessions ON class_sessions.id = class_resource_bookings.class_session_id
          JOIN class_runs ON class_runs.id = class_sessions.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id ORDER BY class_resource_bookings.starts_at ASC`),
    rows(`SELECT class_teacher_bookings.*, teachers.name AS teacher_name, class_sessions.topic, class_runs.name AS run_name, course_catalogs.title AS course_title
          FROM class_teacher_bookings JOIN teachers ON teachers.id = class_teacher_bookings.teacher_id JOIN class_sessions ON class_sessions.id = class_teacher_bookings.class_session_id
          JOIN class_runs ON class_runs.id = class_sessions.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id ORDER BY class_teacher_bookings.starts_at ASC`),
  ]);

  const conflictRows = [
    ...await findConflicts(resourceBookings, "classroom_id", "classroom_name", "Classroom"),
    ...await findConflicts(teacherBookings, "teacher_id", "teacher_name", "Teacher"),
  ];
  const outstanding = invoices.reduce((sum, invoice) => sum + Math.max(0, number(invoice.total_amount) - number(invoice.paid_amount)), 0);
  return Response.json({
    terms, courses, runs, sessions, students, teachers, classrooms, enrollments, invoices, payments, attendance, resourceBookings, teacherBookings, conflicts: conflictRows,
    metrics: {
      openRuns: runs.filter((item) => item.status === "open").length,
      sessionsThisWeek: sessions.filter((item) => new Date(String(item.starts_at).replace(" ", "T")).getTime() < Date.now() + 7 * 86400000).length,
      activeStudents: students.filter((item) => item.status === "active").length,
      outstanding: Math.round(outstanding * 100) / 100,
      conflicts: conflictRows.length,
    },
  });
}

async function findConflicts(source: Row[], idKey: string, nameKey: string, kind: string) {
  const conflicts: Row[] = [];
  for (let left = 0; left < source.length; left += 1) {
    for (let right = left + 1; right < source.length; right += 1) {
      const a = source[left];
      const b = source[right];
      if (a[idKey] === b[idKey] && overlaps(String(a.starts_at), String(a.ends_at), String(b.starts_at), String(b.ends_at))) {
        conflicts.push({ kind, resource: a[nameKey], first: a.course_title, second: b.course_title, starts_at: a.starts_at });
      }
    }
  }
  return conflicts;
}

export async function GET() {
  try {
    return await readPortal();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await seedDatabase();
    const payload = await request.json<ActionPayload>();
    if (payload.action === "createCourse") await createCourse(payload);
    if (payload.action === "createClassRun") await createClassRun(payload);
    if (payload.action === "createSession") await createSession(payload);
    if (payload.action === "enrollStudent") await enrollStudent(payload.runId, payload.studentId);
    if (payload.action === "recordPayment") await recordPayment(payload);
    if (payload.action === "setAttendance") await setAttendance(payload);
    if (payload.action === "updateCourse" || payload.action === "updateRun") await updateEntity(payload);
    if (payload.action === "createStudent" || payload.action === "createTeacher" || payload.action === "createClassroom") await createBaseRecord(payload);
    if (payload.action === "updateClassroomMap") await updateClassroomMap(payload);
    return await readPortal();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save data." }, { status: 400 });
  }
}
