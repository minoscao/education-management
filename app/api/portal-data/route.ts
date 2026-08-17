import { env } from "cloudflare:workers";

type Row = Record<string, unknown>;

type ActionPayload = {
  action?: string;
  courseId?: string;
  runId?: string;
  sessionId?: string;
  studentId?: string;
  studentName?: string;
  studentLevel?: string;
  studentPhone?: string;
  studentEmail?: string;
  studentBookingId?: string;
  invoiceId?: string;
  title?: string;
  subject?: string;
  level?: string;
  sessions?: number | string;
  minutes?: number | string;
  price?: number | string;
  color?: string;
  lessonPlan?: string;
  sessionIds?: string;
  weeklySlots?: string;
  name?: string;
  termId?: string;
  capacity?: number | string;
  allowLateJoin?: boolean | string | number;
  topic?: string;
  startsAt?: string;
  endsAt?: string;
  startDate?: string;
  startTime?: string;
  durationMinutes?: number | string;
  classroomId?: string;
  teacherId?: string;
  languageId?: string;
  payAmount?: number | string;
  amount?: number | string;
  discount?: number | string;
  contractedFee?: number | string;
  payNow?: boolean | string;
  method?: string;
  proofReference?: string;
  attendanceStatus?: string;
  note?: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  location?: string;
  campusId?: string;
  address?: string;
  mapLabel?: string;
  roomType?: string;
  resources?: string;
  mapX?: number | string;
  mapY?: number | string;
  mapWidth?: number | string;
  mapHeight?: number | string;
  businessStart?: string;
  businessEnd?: string;
  businessDays?: string;
  mapImage?: string;
  sender?: string;
  inboundProtocol?: string;
  inboundHost?: string;
  inboundPort?: string;
  smtpHost?: string;
  smtpPort?: string;
  recipient?: string;
  body?: string;
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

function validTime(value: unknown) {
  const time = String(value ?? "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
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

async function executeBatch(statements: { sql: string; values: unknown[] }[]) {
  if (!statements.length) return;
  return db().batch(statements.map((statement) => db().prepare(statement.sql).bind(...statement.values)));
}

async function executeBatchInChunks(statements: { sql: string; values: unknown[] }[], size = 80) {
  for (let index = 0; index < statements.length; index += size) await executeBatch(statements.slice(index, index + size));
}

const portalBootstrapKey = "portal_bootstrap_v6";
const sampleSeedKeys = [
  "v2_seeded",
  "portal_bootstrap_v5",
  portalBootstrapKey,
  "operational_sample_v2",
  "malaysia_term_sample_v3",
  "rich_campus_sample_v4",
  "course_intakes_v5",
  "course_template_assignments_v6",
];

async function coreSeedCounts() {
  return row<{
    courses: number;
    teachers: number;
    students: number;
    runs: number;
    sessions: number;
  }>(`SELECT
      (SELECT COUNT(*) FROM course_catalogs) AS courses,
      (SELECT COUNT(*) FROM teachers) AS teachers,
      (SELECT COUNT(*) FROM students) AS students,
      (SELECT COUNT(*) FROM class_runs) AS runs,
      (SELECT COUNT(*) FROM class_sessions) AS sessions`);
}

function hasUsableSeedData(counts?: { courses: number; teachers: number; students: number; runs: number; sessions: number } | null) {
  return number(counts?.courses) > 0
    && number(counts?.teachers) > 0
    && number(counts?.students) > 0
    && number(counts?.runs) > 0
    && number(counts?.sessions) > 0;
}

async function resetSeedMarkers() {
  const placeholders = sampleSeedKeys.map(() => "?").join(", ");
  await execute(`DELETE FROM app_settings WHERE key IN (${placeholders})`, sampleSeedKeys);
}

async function seedDatabase() {
  await ensureCourseLessonBlueprints();
  await ensureClassRunEnrollmentRules();
  await ensureTeachingConfiguration();
  // Initial sample data and schema compatibility work are expensive on D1.
  // Run them once, then leave ordinary reads to the portal queries below.
  const ready = await row<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [portalBootstrapKey]);
  if (ready) {
    const counts = await coreSeedCounts();
    if (hasUsableSeedData(counts)) return;
    await resetSeedMarkers();
  }

  await ensurePaymentData();
  const seeded = await row<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", ["v2_seeded"]);
  if (seeded) {
    await ensureCampuses();
    await ensureClassroomLayouts();
    await ensureCourseColours();
    await ensureOperationalSampleData();
    await ensureMalaysiaTermSampleData();
    await ensureRichCampusSampleData();
    await ensureCourseIntakeSampleData();
    await ensureCourseLessonBlueprints();
    await ensureCommunicationData();
    await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [portalBootstrapKey, "true"]);
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
  await ensureCampuses();
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
  await ensureMalaysiaTermSampleData();
  await ensureRichCampusSampleData();
  await ensureCourseIntakeSampleData();
  await ensureCourseLessonBlueprints();
  await ensureCommunicationData();
  await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", ["v2_seeded", "true"]);
  await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [portalBootstrapKey, "true"]);
}

async function ensureClassRunEnrollmentRules() {
  const columns = await rows<{ name: string }>("PRAGMA table_info('class_runs')");
  const names = new Set(columns.map((item) => item.name));
  if (!names.has("allow_late_join")) await execute("ALTER TABLE class_runs ADD COLUMN allow_late_join integer DEFAULT 1 NOT NULL");
  await execute("UPDATE class_runs SET allow_late_join = 1 WHERE allow_late_join IS NULL");
}

async function ensureTeachingConfiguration() {
  await execute("CREATE TABLE IF NOT EXISTS teaching_languages (id text PRIMARY KEY NOT NULL, code text UNIQUE NOT NULL, name text NOT NULL, display_color text NOT NULL DEFAULT '#0F8AA8')");
  await execute("CREATE TABLE IF NOT EXISTS teacher_languages (teacher_id text NOT NULL, language_id text NOT NULL, PRIMARY KEY (teacher_id, language_id))");
  const columns = await rows<{ name: string }>("PRAGMA table_info('class_runs')");
  const names = new Set(columns.map((item) => item.name));
  if (!names.has("language_id")) await execute("ALTER TABLE class_runs ADD COLUMN language_id text");
  if (!names.has("teacher_id")) await execute("ALTER TABLE class_runs ADD COLUMN teacher_id text");
}

function dateAfter(startDate: string, days: number) {
  const date = new Date(`${startDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function resetToClientTeachingPlan() {
  await ensureTeachingConfiguration();
  await ensureCommunicationData();

  // This replaces the old demo catalogue only. Campus and room records are kept
  // as operational resources, while all teaching, people and enrollment samples are rebuilt.
  const clears = [
    "DELETE FROM class_attendance",
    "DELETE FROM class_student_bookings",
    "DELETE FROM student_payments",
    "DELETE FROM student_invoices",
    "DELETE FROM class_enrollments",
    "DELETE FROM class_teacher_bookings",
    "DELETE FROM class_resource_bookings",
    "DELETE FROM class_sessions",
    "DELETE FROM course_lesson_templates",
    "DELETE FROM class_runs",
    "DELETE FROM course_catalogs",
    "DELETE FROM student_messages",
    "DELETE FROM portal_notifications",
    "DELETE FROM attendance_records",
    "DELETE FROM student_bookings",
    "DELETE FROM teacher_bookings",
    "DELETE FROM resource_bookings",
    "DELETE FROM course_sessions",
    "DELETE FROM enrollments",
    "DELETE FROM courses",
    "DELETE FROM teacher_languages",
    "DELETE FROM teaching_languages",
    "DELETE FROM teachers",
    "DELETE FROM students",
  ];
  for (const sql of clears) await execute(sql);

  const languages = [
    ["lang-ce", "CE", "华语 / English", "#2563EB"],
    ["lang-me", "ME", "Bahasa Melayu / English", "#7C3AED"],
    ["lang-zh", "ZH", "华文（UEC）", "#0F766E"],
  ];
  const teachers = [
    ["teacher-lim-wei", "TCH-PPM-01", "Teacher Lim Wei", "Mathematics + Sudoku", "012-410 2101", "available", ["lang-ce"]],
    ["teacher-lee-hui", "TCH-PPM-02", "Teacher Lee Hui", "Mathematics + Sudoku", "012-410 2102", "available", ["lang-ce"]],
    ["teacher-aisyah", "TCH-PPM-03", "Cikgu Aisyah", "Matematik + Sudoku", "012-410 2103", "available", ["lang-me"]],
    ["teacher-ng-jun", "TCH-PPM-04", "Teacher Ng Jun", "Mathematics + Sudoku", "012-410 2104", "available", ["lang-ce"]],
    ["teacher-chen-yi", "TCH-PPM-05", "Teacher Chen Yi", "Mathematics + Sudoku", "012-410 2105", "available", ["lang-ce"]],
    ["teacher-farah", "TCH-PPM-06", "Cikgu Farah", "Matematik + Sudoku", "012-410 2106", "available", ["lang-me"]],
    ["teacher-wong-kai", "TCH-PPM-07", "Teacher Wong Kai", "Mathematics + Sudoku", "012-410 2107", "available", ["lang-ce"]],
    ["teacher-nadia", "TCH-PPM-08", "Cikgu Nadia", "Matematik + Sudoku", "012-410 2108", "available", ["lang-me"]],
    ["teacher-hana", "TCH-PPM-09", "Ms Hana", "Communication", "012-410 2109", "available", ["lang-ce"]],
    ["teacher-zara", "TCH-PPM-10", "Ms Zara", "Communication", "012-410 2110", "available", ["lang-ce"]],
    ["teacher-tan-uec", "TCH-PPM-11", "Teacher Tan", "华文沟通", "012-410 2111", "available", ["lang-zh"]],
  ] as const;
  const courses = [
    ["course-math-primary", "PPM-MATH-P", "Mathematics + Sudoku", "Mathematics", "Primary SJK · G4–G6", 12, 90, 360, "#2563EB", "active"],
    ["course-math-lower", "PPM-MATH-L", "Mathematics + Sudoku", "Mathematics", "Lower Secondary · F1–F3 / L1–L3", 12, 90, 420, "#2563EB", "active"],
    ["course-math-higher", "PPM-MATH-H", "Mathematics + Sudoku", "Mathematics", "Higher Secondary · F4–F5 / H1–H3", 12, 90, 460, "#2563EB", "active"],
    ["course-comm-primary", "PPM-COMM-P", "Communication", "Communication", "Primary SJK · G4–G6", 12, 90, 330, "#0F8AA8", "active"],
    ["course-comm-lower", "PPM-COMM-L", "Communication", "Communication", "Lower Secondary · F1–F3 / L1–L3", 12, 90, 390, "#0F8AA8", "active"],
    ["course-comm-higher", "PPM-COMM-H", "Communication", "Communication", "Higher Secondary · F4–F5 / H1–H3", 12, 90, 430, "#0F8AA8", "active"],
  ] as const;
  const topicSets: Record<string, string[]> = {
    "course-math-primary": ["Whole numbers and operations", "Fractions, decimals and percentages", "Ratio and proportion", "Measurement", "Geometry", "Data handling", "Patterns and sequences", "Problem-solving strategies", "Sudoku logic foundations", "Sudoku deduction", "Mixed application", "Revision and challenge"],
    "course-math-lower": ["Integers and indices", "Algebraic expressions", "Linear equations", "Ratio, rate and proportion", "Coordinates and graphs", "Geometry and transformation", "Statistics and probability", "Financial mathematics", "Sudoku logic foundations", "Sudoku deduction", "KSSM problem solving", "Revision and challenge"],
    "course-math-higher": ["Functions and algebra", "Quadratic relationships", "Trigonometry", "Coordinate geometry", "Statistics and probability", "Financial mathematics", "Reasoning and proof", "Modelling and problem solving", "Sudoku strategy", "Advanced deduction", "Exam application", "Revision and challenge"],
    "course-comm-primary": ["Listening with purpose", "Everyday speaking", "Reading for meaning", "Useful vocabulary", "Sentence building", "Clear writing", "Presentation practice", "Conversation skills", "Audience awareness", "Storytelling", "Project rehearsal", "Communication showcase"],
    "course-comm-lower": ["Active listening", "Structured discussion", "Reading and inference", "Vocabulary in context", "Paragraph organisation", "Presentation skills", "Persuasive communication", "Team collaboration", "Audience and tone", "Interview practice", "Project rehearsal", "Communication showcase"],
    "course-comm-higher": ["Professional communication", "Critical listening", "Argument and evidence", "Formal writing", "Presentation structure", "Discussion leadership", "Interview communication", "Audience adaptation", "Collaborative problem solving", "Project rehearsal", "Public speaking", "Communication showcase"],
  };

  await executeBatchInChunks([
    ...languages.map((item) => ({ sql: "INSERT INTO teaching_languages (id, code, name, display_color) VALUES (?, ?, ?, ?)", values: [...item] })),
    ...teachers.map(([idValue, code, name, subject, phone, status]) => ({ sql: "INSERT INTO teachers (id, code, name, subject, phone, status) VALUES (?, ?, ?, ?, ?, ?)", values: [idValue, code, name, subject, phone, status] })),
    ...teachers.flatMap(([teacherId, , , , , , languageIds]) => languageIds.map((languageId) => ({ sql: "INSERT INTO teacher_languages (teacher_id, language_id) VALUES (?, ?)", values: [teacherId, languageId] }))),
    ...courses.map((item) => ({ sql: "INSERT INTO course_catalogs (id, code, title, subject, level, default_sessions, default_minutes, list_price, display_color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values: [...item] })),
    ...courses.flatMap(([courseId]) => topicSets[courseId].map((title, index) => ({ sql: "INSERT INTO course_lesson_templates (id, course_id, lesson_no, title, default_duration_minutes) VALUES (?, ?, ?, ?, ?)", values: [`plan-template-${courseId}-${index + 1}`, courseId, index + 1, title, 90] }))),
  ]);

  const rooms = [
    ["plan-room-p1", "P-01", "P-01", "Primary classroom", 26],
    ["plan-room-p2", "P-02", "P-02", "Primary classroom", 26],
    ["plan-room-s1", "S-01", "S-01", "Secondary classroom", 26],
    ["plan-room-s2", "S-02", "S-02", "Secondary classroom", 26],
  ];
  await executeBatchInChunks(rooms.map(([idValue, code, name, location, capacity]) => ({ sql: "INSERT OR REPLACE INTO classrooms (id, code, name, location, capacity, status, campus_id, room_type, resources) VALUES (?, ?, ?, ?, ?, 'active', 'campus-one', 'classroom', 'Whiteboard, projector')", values: [idValue, code, name, location, capacity] })));
  await execute("INSERT OR REPLACE INTO academic_terms (id, code, name, starts_on, ends_on, status) VALUES (?, ?, ?, ?, ?, ?)", ["term-ppm-2026", "PPM-2026-Q3", "PPM Opening Plan · 2026", "2026-08-24", "2026-11-15", "active"]);

  type PlanRun = { courseId: string; code: string; name: string; languageId: string; teacherId: string; weekday: number; time: string; roomId: string; students: number };
  const plan: PlanRun[] = [];
  const add = (courseId: string, code: string, name: string, languageId: string, teacherId: string, weekday: number, time: string, roomId: string) => plan.push({ courseId, code, name, languageId, teacherId, weekday, time, roomId, students: 18 + (plan.length * 5) % 9 });
  add("course-math-primary", "PPM-P-01", "G4 · Monday PM", "lang-ce", "teacher-lim-wei", 1, "14:30", "plan-room-p1");
  add("course-math-primary", "PPM-P-02", "G4 · Monday PM", "lang-ce", "teacher-lee-hui", 1, "16:00", "plan-room-p2");
  add("course-math-primary", "PPM-P-03", "G5 · Tuesday PM", "lang-ce", "teacher-lim-wei", 2, "14:30", "plan-room-p1");
  add("course-math-primary", "PPM-P-04", "G5 · Tuesday PM", "lang-ce", "teacher-lee-hui", 2, "16:00", "plan-room-p2");
  add("course-math-primary", "PPM-P-05", "G6 · Wednesday PM", "lang-ce", "teacher-lim-wei", 3, "14:30", "plan-room-p1");
  add("course-math-primary", "PPM-P-06", "G6 · Wednesday PM", "lang-ce", "teacher-lee-hui", 3, "16:00", "plan-room-p2");
  add("course-math-primary", "PPM-P-07", "G4 · Thursday PM", "lang-me", "teacher-aisyah", 4, "14:30", "plan-room-p2");
  add("course-math-primary", "PPM-P-08", "G5 · Thursday PM", "lang-me", "teacher-aisyah", 4, "16:00", "plan-room-p2");
  add("course-math-primary", "PPM-P-09", "G6 · Friday PM", "lang-me", "teacher-aisyah", 5, "14:30", "plan-room-p2");
  add("course-math-primary", "PPM-P-10", "G6 · Friday PM", "lang-me", "teacher-aisyah", 5, "16:00", "plan-room-p2");
  add("course-comm-primary", "PPM-P-11", "Primary Communication · Saturday AM", "lang-ce", "teacher-hana", 6, "09:00", "plan-room-p1");
  add("course-comm-primary", "PPM-P-12", "Primary 华文沟通 · Sunday AM", "lang-zh", "teacher-tan-uec", 0, "09:00", "plan-room-p1");
  add("course-math-lower", "PPM-L-01", "F1 · Monday PM", "lang-ce", "teacher-ng-jun", 1, "18:30", "plan-room-s1");
  add("course-math-lower", "PPM-L-02", "L1 · Monday PM", "lang-ce", "teacher-chen-yi", 1, "20:00", "plan-room-s2");
  add("course-math-lower", "PPM-L-03", "F2 · Tuesday PM", "lang-ce", "teacher-ng-jun", 2, "18:30", "plan-room-s1");
  add("course-math-lower", "PPM-L-04", "L2 · Tuesday PM", "lang-ce", "teacher-chen-yi", 2, "20:00", "plan-room-s2");
  add("course-math-lower", "PPM-L-05", "F3 · Wednesday PM", "lang-ce", "teacher-ng-jun", 3, "18:30", "plan-room-s1");
  add("course-math-lower", "PPM-L-06", "L3 · Wednesday PM", "lang-ce", "teacher-chen-yi", 3, "20:00", "plan-room-s2");
  add("course-math-lower", "PPM-L-07", "F1 · Thursday PM", "lang-ce", "teacher-ng-jun", 4, "18:30", "plan-room-s1");
  add("course-math-lower", "PPM-L-08", "F2 · Thursday PM", "lang-ce", "teacher-chen-yi", 4, "20:00", "plan-room-s2");
  add("course-math-lower", "PPM-L-09", "F3 · Friday PM", "lang-me", "teacher-farah", 5, "18:30", "plan-room-s1");
  add("course-math-lower", "PPM-L-10", "L1 · Friday PM", "lang-me", "teacher-farah", 5, "20:00", "plan-room-s2");
  add("course-math-lower", "PPM-L-11", "L2 · Saturday AM", "lang-me", "teacher-farah", 6, "10:30", "plan-room-s1");
  add("course-comm-lower", "PPM-L-12", "Lower Communication · Saturday AM", "lang-ce", "teacher-zara", 6, "09:00", "plan-room-s2");
  add("course-comm-lower", "PPM-L-13", "Lower 华文沟通 · Sunday AM", "lang-zh", "teacher-tan-uec", 0, "10:30", "plan-room-s1");
  add("course-math-higher", "PPM-H-01", "F4 · Saturday PM", "lang-ce", "teacher-wong-kai", 6, "13:00", "plan-room-s1");
  add("course-math-higher", "PPM-H-02", "F5 · Saturday PM", "lang-ce", "teacher-wong-kai", 6, "14:30", "plan-room-s2");
  add("course-math-higher", "PPM-H-03", "H1 · Saturday PM", "lang-ce", "teacher-wong-kai", 6, "16:00", "plan-room-s1");
  add("course-math-higher", "PPM-H-04", "H2 · Saturday PM", "lang-ce", "teacher-wong-kai", 6, "17:30", "plan-room-s2");
  add("course-math-higher", "PPM-H-05", "H3 · Sunday PM", "lang-ce", "teacher-wong-kai", 0, "13:00", "plan-room-s1");
  add("course-math-higher", "PPM-H-06", "F4 · Saturday PM", "lang-me", "teacher-nadia", 6, "16:00", "plan-room-s2");
  add("course-math-higher", "PPM-H-07", "F5 · Sunday PM", "lang-me", "teacher-nadia", 0, "14:30", "plan-room-s2");
  add("course-comm-higher", "PPM-H-08", "Higher Communication · Sunday PM", "lang-ce", "teacher-zara", 0, "16:00", "plan-room-s1");
  add("course-comm-higher", "PPM-H-09", "Higher 华文沟通 · Sunday PM", "lang-zh", "teacher-tan-uec", 0, "17:30", "plan-room-s2");
  if (plan.length !== 34) throw new Error("The PPM opening plan must contain exactly 34 classes.");

  await executeBatchInChunks(plan.map((run, index) => ({ sql: "INSERT INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at, language_id, teacher_id) VALUES (?, ?, ?, ?, ?, 26, ?, 'open', '2026-08-17 09:00', '2026-09-30 18:00', ?, ?)", values: [`plan-run-${String(index + 1).padStart(2, "0")}`, run.code, run.courseId, "term-ppm-2026", run.name, courses.find((course) => course[0] === run.courseId)?.[7] ?? 0, run.languageId, run.teacherId] })));

  const sessions: { sql: string; values: unknown[] }[] = [];
  const students: { sql: string; values: unknown[] }[] = [];
  const enrollments: { sql: string; values: unknown[] }[] = [];
  const givenNames = ["Ahmad", "Aina", "Aisyah", "Amir", "Arjun", "Aryan", "Daniel", "Darren", "Divya", "Ethan", "Farah", "Hannah", "Iman", "Izzat", "Jia En", "Kavin", "Kavya", "Mei Xin", "Nadia", "Nisha", "Nur", "Priya", "Rayyan", "Siti", "Sofia", "Wei Jian", "Xin Yi", "Yash", "Zara", "Zoey", "Hakim"];
  const familyNames = ["Tan", "Lim", "Lee", "Wong", "Goh", "Chong", "Ng", "Ong", "Yap", "Lau", "Kumar", "Raj", "Nair", "Singh", "Kaur", "Subramaniam", "Aziz", "Hassan", "Rahman", "Ismail", "Hamid", "Yusof", "Zainal", "Ibrahim", "Abdullah", "Yap", "Chew", "Teo", "Low", "Chan", "Ho"];
  plan.forEach((run, runIndex) => {
    const runId = `plan-run-${String(runIndex + 1).padStart(2, "0")}`;
    const weekdayOffset = (run.weekday - 1 + 7) % 7;
    const firstDate = dateAfter("2026-08-24", weekdayOffset);
    const topics = topicSets[run.courseId];
    topics.forEach((topic, lessonIndex) => {
      const startsAt = `${dateAfter(firstDate, lessonIndex * 7)} ${run.time}`;
      const sessionId = `plan-session-${String(runIndex + 1).padStart(2, "0")}-${String(lessonIndex + 1).padStart(2, "0")}`;
      sessions.push(
        { sql: "INSERT INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')", values: [sessionId, runId, lessonIndex + 1, topic, startsAt, later(startsAt, 90)] },
        { sql: "INSERT INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'reserved')", values: [`plan-rb-${sessionId}`, sessionId, run.roomId, startsAt, later(startsAt, 90)] },
        { sql: "INSERT INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, 90, 'unpaid', 'confirmed')", values: [`plan-tb-${sessionId}`, sessionId, run.teacherId, startsAt, later(startsAt, 90)] },
      );
    });
    for (let studentIndex = 0; studentIndex < run.students; studentIndex += 1) {
      const studentId = `plan-student-${String(runIndex + 1).padStart(2, "0")}-${String(studentIndex + 1).padStart(2, "0")}`;
      const studentOrdinal = runIndex * 26 + studentIndex;
      const studentName = `${givenNames[studentOrdinal % givenNames.length]} ${familyNames[Math.floor(studentOrdinal / givenNames.length) % familyNames.length]}`;
      students.push({ sql: "INSERT INTO students (id, code, name, level, guardian_phone, status, email, avatar_url) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)", values: [studentId, `STU-PPM-${String(runIndex + 1).padStart(2, "0")}-${String(studentIndex + 1).padStart(2, "0")}`, studentName, run.name.split(" · ")[0], "", `learner.${runIndex + 1}.${studentIndex + 1}@family.example`, `sprite:${(runIndex + studentIndex) % 8}`] });
      enrollments.push({ sql: "INSERT INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, enrolled_at) VALUES (?, ?, ?, ?, 'enrolled', '2026-08-17 09:00')", values: [`plan-enrollment-${String(runIndex + 1).padStart(2, "0")}-${String(studentIndex + 1).padStart(2, "0")}`, runId, studentId, courses.find((course) => course[0] === run.courseId)?.[7] ?? 0] });
    }
  });
  await executeBatchInChunks(sessions);
  await executeBatchInChunks(students);
  await executeBatchInChunks(enrollments);
  await expandPpmCourseProducts();
  await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [portalBootstrapKey, "true"]);
  await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", ["client_ppm_plan_v1", "34 class plan loaded"]);
}

async function refreshClientPlanStudentNames() {
  const students = await rows<{ id: string }>("SELECT id FROM students WHERE id LIKE 'plan-student-%' ORDER BY id");
  const givenNames = ["Ahmad", "Aina", "Aisyah", "Amir", "Arjun", "Aryan", "Daniel", "Darren", "Divya", "Ethan", "Farah", "Hannah", "Iman", "Izzat", "Jia En", "Kavin", "Kavya", "Mei Xin", "Nadia", "Nisha", "Nur", "Priya", "Rayyan", "Siti", "Sofia", "Wei Jian", "Xin Yi", "Yash", "Zara", "Zoey", "Hakim"];
  const familyNames = ["Tan", "Lim", "Lee", "Wong", "Goh", "Chong", "Ng", "Ong", "Yap", "Lau", "Kumar", "Raj", "Nair", "Singh", "Kaur", "Subramaniam", "Aziz", "Hassan", "Rahman", "Ismail", "Hamid", "Yusof", "Zainal", "Ibrahim", "Abdullah", "Yap", "Chew", "Teo", "Low", "Chan", "Ho"];
  await executeBatchInChunks(students.map((student, index) => ({ sql: "UPDATE students SET name = ? WHERE id = ?", values: [`${givenNames[index % givenNames.length]} ${familyNames[Math.floor(index / givenNames.length) % familyNames.length]}`, student.id] })));
}

async function expandPpmCourseProducts() {
  const mathProducts = [
    ["course-math-primary", "PPM-MATH-G4", "Mathematics + Sudoku G4", "Primary SJK · G4", "primary"],
    ["course-math-g5", "PPM-MATH-G5", "Mathematics + Sudoku G5", "Primary SJK · G5", "primary"],
    ["course-math-g6", "PPM-MATH-G6", "Mathematics + Sudoku G6", "Primary SJK · G6", "primary"],
    ["course-math-lower", "PPM-MATH-F1", "Mathematics + Sudoku F1", "Lower Secondary · F1", "lower"],
    ["course-math-l1", "PPM-MATH-L1", "Mathematics + Sudoku L1", "DuZhong · L1", "lower"],
    ["course-math-f2", "PPM-MATH-F2", "Mathematics + Sudoku F2", "Lower Secondary · F2", "lower"],
    ["course-math-l2", "PPM-MATH-L2", "Mathematics + Sudoku L2", "DuZhong · L2", "lower"],
    ["course-math-f3", "PPM-MATH-F3", "Mathematics + Sudoku F3", "Lower Secondary · F3", "lower"],
    ["course-math-l3", "PPM-MATH-L3", "Mathematics + Sudoku L3", "DuZhong · L3", "lower"],
    ["course-math-higher", "PPM-MATH-F4", "Mathematics + Sudoku F4", "Higher Secondary · F4", "higher"],
    ["course-math-h1", "PPM-MATH-H1", "Mathematics + Sudoku H1", "DuZhong · H1", "higher"],
    ["course-math-f5", "PPM-MATH-F5", "Mathematics + Sudoku F5", "Higher Secondary · F5", "higher"],
    ["course-math-h2", "PPM-MATH-H2", "Mathematics + Sudoku H2", "DuZhong · H2", "higher"],
    ["course-math-h3", "PPM-MATH-H3", "Mathematics + Sudoku H3", "DuZhong · H3", "higher"],
  ] as const;
  const stageTopics: Record<string, string[]> = {
    primary: ["Whole numbers and operations", "Fractions, decimals and percentages", "Ratio and proportion", "Measurement", "Geometry", "Data handling", "Patterns and sequences", "Problem-solving strategies", "Sudoku logic foundations", "Sudoku deduction", "Mixed application", "Revision and challenge"],
    lower: ["Integers and indices", "Algebraic expressions", "Linear equations", "Ratio, rate and proportion", "Coordinates and graphs", "Geometry and transformation", "Statistics and probability", "Financial mathematics", "Sudoku logic foundations", "Sudoku deduction", "KSSM problem solving", "Revision and challenge"],
    higher: ["Functions and algebra", "Quadratic relationships", "Trigonometry", "Coordinate geometry", "Statistics and probability", "Financial mathematics", "Reasoning and proof", "Modelling and problem solving", "Sudoku strategy", "Advanced deduction", "Exam application", "Revision and challenge"],
  };
  await executeBatchInChunks(mathProducts.map(([courseId, code, title, level]) => ({
    sql: "INSERT INTO course_catalogs (id, code, title, subject, level, default_sessions, default_minutes, list_price, display_color, status) VALUES (?, ?, ?, 'Mathematics', ?, 12, 90, 420, '#2563EB', 'active') ON CONFLICT(id) DO UPDATE SET code = excluded.code, title = excluded.title, subject = excluded.subject, level = excluded.level, default_sessions = 12, default_minutes = 90, list_price = 420, display_color = '#2563EB', status = 'active'",
    values: [courseId, code, title, level],
  })));
  await executeBatchInChunks(mathProducts.flatMap(([courseId, , , , stage]) => stageTopics[stage].map((title, index) => ({
    sql: "INSERT OR IGNORE INTO course_lesson_templates (id, course_id, lesson_no, title, default_duration_minutes) VALUES (?, ?, ?, ?, 90)",
    values: [`ppm-template-${courseId}-${index + 1}`, courseId, index + 1, title],
  }))));
  const courseByClassPrefix: [string, string][] = [
    ["G4 ·", "course-math-primary"], ["G5 ·", "course-math-g5"], ["G6 ·", "course-math-g6"],
    ["F1 ·", "course-math-lower"], ["L1 ·", "course-math-l1"], ["F2 ·", "course-math-f2"], ["L2 ·", "course-math-l2"], ["F3 ·", "course-math-f3"], ["L3 ·", "course-math-l3"],
    ["F4 ·", "course-math-higher"], ["H1 ·", "course-math-h1"], ["F5 ·", "course-math-f5"], ["H2 ·", "course-math-h2"], ["H3 ·", "course-math-h3"],
  ];
  const runs = await rows<{ id: string; name: string }>("SELECT id, name FROM class_runs WHERE course_id LIKE 'course-math-%'");
  await executeBatchInChunks(runs.flatMap((run) => {
    const target = courseByClassPrefix.find(([prefix]) => run.name.startsWith(prefix))?.[1];
    return target ? [{ sql: "UPDATE class_runs SET course_id = ? WHERE id = ?", values: [target, run.id] }] : [];
  }));
}

async function ensureCourseLessonBlueprints() {
  await execute("CREATE TABLE IF NOT EXISTS course_lesson_templates (id text PRIMARY KEY NOT NULL, course_id text NOT NULL, lesson_no integer NOT NULL, title text NOT NULL, default_duration_minutes integer DEFAULT 90 NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, UNIQUE(course_id, lesson_no))");
  const columns = await rows<{ name: string }>("PRAGMA table_info(course_lesson_templates)");
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("default_teacher_id")) await execute("ALTER TABLE course_lesson_templates ADD COLUMN default_teacher_id text");
  if (!names.has("default_classroom_id")) await execute("ALTER TABLE course_lesson_templates ADD COLUMN default_classroom_id text");
  if (!names.has("default_pay_amount")) await execute("ALTER TABLE course_lesson_templates ADD COLUMN default_pay_amount real DEFAULT 0");
  const assignmentsBackfilled = await row("SELECT value FROM app_settings WHERE key = ?", ["course_template_assignments_v6"]);
  const courses = await rows<{ id: string; default_sessions: number; default_minutes: number }>("SELECT id, default_sessions, default_minutes FROM course_catalogs");
  for (const course of courses) {
    const existing = await row<{ count: number }>("SELECT COUNT(*) AS count FROM course_lesson_templates WHERE course_id = ?", [course.id]);
    if (!number(existing?.count)) {
      const source = await rows<{ session_no: number; topic: string }>("SELECT session_no, topic FROM class_sessions WHERE class_run_id = (SELECT id FROM class_runs WHERE course_id = ? ORDER BY created_at DESC LIMIT 1) ORDER BY session_no LIMIT ?", [course.id, Math.max(1, number(course.default_sessions, 1))]);
      const count = Math.max(1, number(course.default_sessions, source.length || 1));
      await executeBatch(Array.from({ length: count }, (_, index) => ({ sql: "INSERT OR IGNORE INTO course_lesson_templates (id, course_id, lesson_no, title, default_duration_minutes) VALUES (?, ?, ?, ?, ?)", values: [id("lesson-template"), course.id, index + 1, source[index]?.topic || `Lesson ${index + 1}`, Math.max(30, number(course.default_minutes, 90))] })));
    }
    if (assignmentsBackfilled) continue;
    const assignment = await row<{ teacher_id: string; classroom_id: string; pay_amount: number }>(
      `SELECT class_teacher_bookings.teacher_id, class_resource_bookings.classroom_id, class_teacher_bookings.pay_amount
       FROM class_sessions
       JOIN class_runs ON class_runs.id = class_sessions.class_run_id
       LEFT JOIN class_teacher_bookings ON class_teacher_bookings.class_session_id = class_sessions.id
       LEFT JOIN class_resource_bookings ON class_resource_bookings.class_session_id = class_sessions.id
       WHERE class_runs.course_id = ? ORDER BY class_sessions.starts_at DESC LIMIT 1`,
      [course.id],
    );
    if (assignment) await execute(
      "UPDATE course_lesson_templates SET default_teacher_id = COALESCE(default_teacher_id, ?), default_classroom_id = COALESCE(default_classroom_id, ?), default_pay_amount = CASE WHEN COALESCE(default_pay_amount, 0) = 0 THEN ? ELSE default_pay_amount END WHERE course_id = ?",
      [assignment.teacher_id, assignment.classroom_id, number(assignment.pay_amount), course.id],
    );
  }
  if (!assignmentsBackfilled) await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", ["course_template_assignments_v6", "true"]);
}

async function ensureCommunicationData() {
  try { await execute("ALTER TABLE students ADD COLUMN email text DEFAULT ''"); } catch { /* Column is already available. */ }
  try { await execute("ALTER TABLE students ADD COLUMN avatar_url text DEFAULT ''"); } catch { /* Column is already available. */ }
  await execute("CREATE TABLE IF NOT EXISTS student_messages (id text PRIMARY KEY NOT NULL, student_id text NOT NULL, recipient text NOT NULL, subject text NOT NULL, body text NOT NULL, direction text DEFAULT 'outbound' NOT NULL, status text DEFAULT 'prepared' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)");
  await execute("CREATE TABLE IF NOT EXISTS portal_notifications (id text PRIMARY KEY NOT NULL, recipient_type text NOT NULL, recipient_id text NOT NULL, title text NOT NULL, body text NOT NULL, status text DEFAULT 'unread' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)");
  await execute("UPDATE students SET email = lower(replace(replace(name, ' ', '.'), '''', '')) || '@family.example' WHERE email IS NULL OR email = ''");
  await executeBatch([
    ["student-allen", "sprite:0"], ["student-may", "sprite:1"], ["student-jerry", "sprite:2"], ["student-lina", "sprite:3"],
    ["student-aisha", "sprite:4"], ["student-daniel", "sprite:5"], ["student-yuna", "sprite:6"], ["student-sara", "sprite:7"],
  ].map(([studentId, avatarUrl]) => ({ sql: "UPDATE students SET avatar_url = ? WHERE id = ? AND (avatar_url IS NULL OR avatar_url = '')", values: [avatarUrl, studentId] })));
  await executeBatch([
    { sql: "INSERT OR IGNORE INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values: ["run-eng-y7-history", "ENG-Y7-2026-H", "course-english-y7", "term-current", "English Year 7 - April PM", 18, 390, "finished", "2026-03-01 09:00", "2026-04-30 18:00"] },
    { sql: "INSERT OR IGNORE INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, enrolled_at) VALUES (?, ?, ?, ?, ?, ?)", values: ["history-enr-allen", "run-eng-y7-history", "student-allen", 390, "enrolled", "2026-03-05 09:00"] },
    { sql: "INSERT OR IGNORE INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, enrolled_at) VALUES (?, ?, ?, ?, ?, ?)", values: ["history-enr-may", "run-eng-y7-history", "student-may", 390, "enrolled", "2026-03-05 09:00"] },
    { sql: "INSERT OR IGNORE INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", values: ["history-pay-allen", "PAY-2026-0401", "history-enr-allen", "student-allen", 390, 390, "paid", "2026-03-05", "2026-03-20"] },
    { sql: "INSERT OR IGNORE INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", values: ["history-pay-may", "PAY-2026-0402", "history-enr-may", "student-may", 390, 390, "paid", "2026-03-05", "2026-03-20"] },
    { sql: "INSERT OR IGNORE INTO student_payments (id, invoice_id, student_id, amount, method, proof_reference, note, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values: ["history-payment-allen", "history-pay-allen", "student-allen", 390, "bank_transfer", "TRX-APR-101", "April term received in full", "2026-03-07 10:30"] },
    { sql: "INSERT OR IGNORE INTO student_payments (id, invoice_id, student_id, amount, method, proof_reference, note, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values: ["history-payment-may", "history-pay-may", "student-may", 390, "ewallet", "TNG-APR-202", "Paid by guardian", "2026-03-08 14:10"] },
    { sql: "INSERT OR IGNORE INTO student_messages (id, student_id, recipient, subject, body, direction, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values: ["message-welcome-allen", "student-allen", "allen.tan@family.example", "Welcome to English Year 7", "Your completed April course is now available in your learning history.", "outbound", "sent", "2026-04-30 16:00"] },
  ]);
  await execute("INSERT OR IGNORE INTO student_messages (id, student_id, recipient, subject, body, direction, status, created_at) SELECT 'email-out-' || students.id, students.id, students.email, 'Course update', 'Hello, your current course schedule and learning materials are ready to view.', 'outbound', 'sent', CURRENT_TIMESTAMP FROM students WHERE EXISTS (SELECT 1 FROM class_enrollments WHERE class_enrollments.student_id = students.id)");
  await execute("INSERT OR IGNORE INTO student_messages (id, student_id, recipient, subject, body, direction, status, created_at) SELECT 'email-in-' || students.id, students.id, students.email, 'Re: Course update', 'Thank you. We have received the class schedule and will attend the next lesson.', 'inbound', 'received', CURRENT_TIMESTAMP FROM students WHERE EXISTS (SELECT 1 FROM class_enrollments WHERE class_enrollments.student_id = students.id)");
}

async function ensurePaymentData() {
  try { await execute("ALTER TABLE student_payments ADD COLUMN proof_reference text DEFAULT ''"); } catch { /* Column is already available. */ }
  try { await execute("ALTER TABLE student_payments ADD COLUMN note text DEFAULT ''"); } catch { /* Column is already available. */ }
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

async function ensureCampuses() {
  await execute(
    "INSERT OR IGNORE INTO campuses (id, code, name, address, map_label, status) VALUES (?, ?, ?, ?, ?, ?)",
    ["campus-one", "CAMPUS-ONE", "Campus One", "Main campus", "Level 2", "active"],
  );
  await execute("UPDATE classrooms SET campus_id = ? WHERE campus_id IS NULL OR campus_id = ''", ["campus-one"]);
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
  const completed = await row("SELECT value FROM app_settings WHERE key = ?", ["operational_sample_v2"]);
  if (completed) return;

  const termId = "term-current";
  const teachers = [
    ["teacher-olivia", "TCH-004", "Ms Olivia", "English", "014-5550134", "available"],
    ["teacher-farid", "TCH-005", "Mr Farid", "English", "019-5550188", "available"],
  ];
  const students = [
    ["student-aisha", "SMP-011", "Aisha Rahman", "Year 7", "012-5551005", "active"],
    ["student-daniel", "SMP-012", "Daniel Wong", "Year 7", "012-5551006", "active"],
    ["student-yuna", "SMP-013", "Yuna Lim", "Year 7", "012-5551007", "active"],
    ["student-adam", "SMP-014", "Adam Lee", "Year 6", "012-5551008", "active"],
    ["student-sara", "SMP-015", "Sara Tan", "Year 7", "012-5551009", "active"],
    ["student-noah", "SMP-016", "Noah Chen", "Year 7", "012-5551010", "active"],
  ];
  const courses = [
    ["course-english-y7", "ENG-Y7", "English Year 7", "English", "Year 7", 12, 90, 390, "#4F46E5", "active"],
  ];

  await executeBatch([
    ...teachers.map((teacher) => ({ sql: "INSERT OR IGNORE INTO teachers (id, code, name, subject, phone, status) VALUES (?, ?, ?, ?, ?, ?)", values: teacher })),
    ...students.map((student) => ({ sql: "INSERT OR IGNORE INTO students (id, code, name, level, guardian_phone, status) VALUES (?, ?, ?, ?, ?, ?)", values: student })),
    ...courses.map((course) => ({ sql: "INSERT OR IGNORE INTO course_catalogs (id, code, title, subject, level, default_sessions, default_minutes, list_price, display_color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values: course })),
    { sql: "UPDATE course_catalogs SET default_sessions = ? WHERE id = ?", values: [12, "course-math-y7"] },
    { sql: "INSERT OR IGNORE INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values: ["run-english-y7-a", "ENG-Y7-2026-A", "course-english-y7", termId, "English Year 7 - Wednesday PM", 18, 390, "open", localDate(-14), localDate(28)] },
  ]);

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

  await executeBatch(sessionSeeds.flatMap(([sessionId, runId, sessionNo, topic, startsAt, endsAt, classroomId, teacherId, payAmount]) => [
    { sql: "INSERT OR IGNORE INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)", values: [sessionId, runId, sessionNo, topic, startsAt, endsAt, "scheduled"] },
    { sql: "INSERT OR IGNORE INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?)", values: [`rb-${sessionId}`, sessionId, classroomId, startsAt, endsAt, "reserved"] },
    { sql: "INSERT OR IGNORE INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values: [`tb-${sessionId}`, sessionId, teacherId, startsAt, endsAt, payAmount, "unpaid", "confirmed"] },
  ]));

  const enrollmentSeeds = [
    ["run-math-y7-a", "student-may", 420], ["run-math-y7-a", "student-jerry", 420], ["run-math-y7-a", "student-aisha", 420], ["run-math-y7-a", "student-daniel", 420],
    ["run-english-y7-a", "student-allen", 390], ["run-english-y7-a", "student-jerry", 390], ["run-english-y7-a", "student-lina", 390], ["run-english-y7-a", "student-yuna", 390], ["run-english-y7-a", "student-sara", 390], ["run-english-y7-a", "student-noah", 390],
  ] as const;
  await executeBatch(enrollmentSeeds.map(([runId, studentId, fee]) => ({
    sql: "INSERT OR IGNORE INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, enrolled_at) SELECT ?, ?, ?, ?, 'enrolled', CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM students WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM class_enrollments WHERE class_run_id = ? AND student_id = ?)",
    values: [`sample-enr-${runId}-${studentId}`, runId, studentId, fee, studentId, runId, studentId],
  })));
  await executeBatch(enrollmentSeeds.map(([runId, studentId, fee]) => ({
    sql: "INSERT OR IGNORE INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at) SELECT ?, ?, id, student_id, ?, 0, 'unpaid', CURRENT_TIMESTAMP, ? FROM class_enrollments WHERE class_run_id = ? AND student_id = ? AND NOT EXISTS (SELECT 1 FROM student_invoices WHERE student_invoices.enrollment_id = class_enrollments.id)",
    values: [`sample-inv-${runId}-${studentId}`, `SMP-${runId}-${studentId}`, fee, localDate(14, "00:00").slice(0, 10), runId, studentId],
  })));

  const runIds = ["run-chinese-y7-a", "run-math-y7-a", "run-english-y7-a", "run-violin-beg-a"];
  await executeBatch(runIds.flatMap((runId) => [
    { sql: "UPDATE class_student_bookings SET allocated_fee = ROUND((SELECT contracted_fee / NULLIF((SELECT COUNT(*) FROM class_sessions WHERE class_run_id = ?), 0) FROM class_enrollments WHERE class_enrollments.id = class_student_bookings.enrollment_id), 2) WHERE enrollment_id IN (SELECT id FROM class_enrollments WHERE class_run_id = ?)", values: [runId, runId] },
    { sql: "INSERT OR IGNORE INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status) SELECT 'sample-sb-' || class_enrollments.id || '-' || class_sessions.id, class_sessions.id, class_enrollments.id, class_enrollments.student_id, ROUND(class_enrollments.contracted_fee / NULLIF((SELECT COUNT(*) FROM class_sessions WHERE class_run_id = ?), 0), 2), 'booked' FROM class_enrollments JOIN class_sessions ON class_sessions.class_run_id = class_enrollments.class_run_id LEFT JOIN class_student_bookings ON class_student_bookings.class_session_id = class_sessions.id AND class_student_bookings.enrollment_id = class_enrollments.id WHERE class_enrollments.class_run_id = ? AND class_enrollments.status = 'enrolled' AND class_student_bookings.id IS NULL", values: [runId, runId] },
    { sql: "INSERT OR IGNORE INTO class_attendance (id, student_booking_id, status, note) SELECT 'sample-att-' || class_student_bookings.id, class_student_bookings.id, 'pending', '' FROM class_student_bookings JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id LEFT JOIN class_attendance ON class_attendance.student_booking_id = class_student_bookings.id WHERE class_sessions.class_run_id = ? AND class_attendance.id IS NULL", values: [runId] },
  ]));
  await execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", ["operational_sample_v2", "true"]);
}

async function ensureMalaysiaTermSampleData() {
  const completed = await row("SELECT value FROM app_settings WHERE key = ?", ["malaysia_term_sample_v3"]);
  if (completed) return;

  const termId = "term-current";
  const teachers = [
    ["teacher-aina", "TCH-006", "Ms Aina", "Science", "012-6655101", "available"],
    ["teacher-nurul", "TCH-007", "Cikgu Nurul", "Bahasa Melayu", "017-6655102", "available"],
    ["teacher-raj", "TCH-008", "Mr Raj", "Science", "016-6655103", "available"],
  ];
  const courses = [
    ["course-science-y7", "SCI-Y7", "Science Year 7", "Science", "Year 7", 10, 90, 400, "#0F766E", "active"],
    ["course-science-y9", "SCI-Y9", "Science Year 9", "Science", "Year 9", 10, 90, 450, "#16A34A", "active"],
    ["course-math-y8", "MTH-Y8", "Mathematics Year 8", "Mathematics", "Year 8", 10, 90, 440, "#2563EB", "active"],
    ["course-english-y8", "ENG-Y8", "English Year 8", "English", "Year 8", 10, 90, 410, "#4F46E5", "active"],
    ["course-bm-y7", "BM-Y7", "Bahasa Melayu Year 7", "Bahasa Melayu", "Year 7", 10, 90, 360, "#0F8AA8", "active"],
  ];
  const runs = [
    ["run-science-y7-a", "SCI-Y7-2026-A", "course-science-y7", "Science Year 7 - Saturday PM", 16, 400],
    ["run-science-y9-a", "SCI-Y9-2026-A", "course-science-y9", "Science Year 9 - Saturday PM", 16, 450],
    ["run-math-y8-a", "MTH-Y8-2026-A", "course-math-y8", "Mathematics Year 8 - Saturday PM", 16, 440],
    ["run-english-y8-a", "ENG-Y8-2026-A", "course-english-y8", "English Year 8 - Sunday AM", 16, 410],
    ["run-bm-y7-a", "BM-Y7-2026-A", "course-bm-y7", "Bahasa Melayu Year 7 - Sunday PM", 16, 360],
  ];
  await executeBatch([
    ...teachers.map((teacher) => ({ sql: "INSERT OR IGNORE INTO teachers (id, code, name, subject, phone, status) VALUES (?, ?, ?, ?, ?, ?)", values: teacher })),
    ...courses.map((course) => ({ sql: "INSERT OR IGNORE INTO course_catalogs (id, code, title, subject, level, default_sessions, default_minutes, list_price, display_color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values: course })),
    ...runs.map(([idValue, code, courseId, name, capacity, price]) => ({ sql: "INSERT OR IGNORE INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values: [idValue, code, courseId, termId, name, capacity, price, "open", "2026-07-15 09:00", "2026-09-20 18:00"] })),
  ]);

  const saturdayDates = ["2026-07-25", "2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22", "2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"];
  const sundayDates = ["2026-07-26", "2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"];
  const lessonPlans = [
    ["run-science-y7-a", "session-science-y7", ["Laboratory safety", "Cells and life", "Matter and materials", "Forces in action", "Heat transfer", "Light and shadows", "Plant reproduction", "Ecosystems", "Scientific investigation", "Science revision"], saturdayDates, "15:30", "room-b102", "teacher-aina", 92],
    ["run-science-y9-a", "session-science-y9", ["Atomic structure", "Chemical bonding", "Electric circuits", "Energy transfer", "Human response", "Genetics", "Waves and sound", "Climate systems", "Practical skills", "Science exam practice"], saturdayDates, "16:30", "room-a201", "teacher-raj", 98],
    ["run-math-y8-a", "session-math-y8", ["Integers and indices", "Fractions and ratios", "Percentages", "Algebra foundations", "Linear graphs", "Geometry and angles", "Area and volume", "Statistics", "Problem solving", "Maths revision"], saturdayDates, "13:00", "room-b102", "teacher-sophia", 88],
    ["run-english-y8-a", "session-english-y8", ["Reading with purpose", "Vocabulary choices", "Paragraph building", "Narrative voice", "Grammar in context", "Discussion skills", "Argument writing", "Editing for clarity", "Presentation practice", "English revision"], sundayDates, "15:30", "room-a201", "teacher-farid", 92],
    ["run-bm-y7-a", "session-bm-y7", ["Kefahaman asas", "Tatabahasa", "Perbendaharaan kata", "Penulisan perenggan", "Karangan naratif", "Karangan fakta", "Lisan dan komunikasi", "Pemahaman teks", "Teknik menjawab", "Ulang kaji"], sundayDates, "13:00", "room-a201", "teacher-nurul", 82],
  ] as const;
  const sessionSeeds: [string, string, number, string, string, string, string, string, number][] = [];
  lessonPlans.forEach(([runId, prefix, topics, dates, time, roomId, teacherId, pay]) => topics.forEach((topic, index) => {
    const startsAt = `${dates[index]} ${time}`;
    sessionSeeds.push([`${prefix}-${String(index + 1).padStart(2, "0")}`, runId, index + 1, topic, startsAt, later(startsAt, 90), roomId, teacherId, pay]);
  }));
  await executeBatch(sessionSeeds.flatMap(([sessionId, runId, sessionNo, topic, startsAt, endsAt, classroomId, teacherId, payAmount]) => [
    { sql: "INSERT OR IGNORE INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)", values: [sessionId, runId, sessionNo, topic, startsAt, endsAt, "scheduled"] },
    { sql: "INSERT OR IGNORE INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?)", values: [`rb-${sessionId}`, sessionId, classroomId, startsAt, endsAt, "reserved"] },
    { sql: "INSERT OR IGNORE INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", values: [`tb-${sessionId}`, sessionId, teacherId, startsAt, endsAt, payAmount, "unpaid", "confirmed"] },
  ]));
  const enrollments = [
    ["run-science-y7-a", "student-allen", 400], ["run-science-y7-a", "student-aisha", 400], ["run-science-y7-a", "student-yuna", 400],
    ["run-science-y9-a", "student-noah", 450], ["run-science-y9-a", "student-sara", 450],
    ["run-math-y8-a", "student-daniel", 440], ["run-math-y8-a", "student-may", 440],
    ["run-english-y8-a", "student-jerry", 410], ["run-english-y8-a", "student-lina", 410],
    ["run-bm-y7-a", "student-allen", 360], ["run-bm-y7-a", "student-aisha", 360], ["run-bm-y7-a", "student-sara", 360],
  ] as const;
  await executeBatch(enrollments.flatMap(([runId, studentId, fee]) => [
    { sql: "INSERT OR IGNORE INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, enrolled_at) SELECT ?, ?, ?, ?, 'enrolled', CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM students WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM class_enrollments WHERE class_run_id = ? AND student_id = ?)", values: [`my-enr-${runId}-${studentId}`, runId, studentId, fee, studentId, runId, studentId] },
    { sql: "INSERT OR IGNORE INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at) SELECT ?, ?, id, student_id, ?, 0, 'unpaid', '2026-07-15 09:00', '2026-08-01' FROM class_enrollments WHERE class_run_id = ? AND student_id = ? AND NOT EXISTS (SELECT 1 FROM student_invoices WHERE student_invoices.enrollment_id = class_enrollments.id)", values: [`my-inv-${runId}-${studentId}`, `MY-${runId}-${studentId}`, fee, runId, studentId] },
  ]));
  await executeBatch(runs.flatMap(([runId]) => [
    { sql: "INSERT OR IGNORE INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status) SELECT 'my-sb-' || class_enrollments.id || '-' || class_sessions.id, class_sessions.id, class_enrollments.id, class_enrollments.student_id, ROUND(class_enrollments.contracted_fee / 10, 2), 'booked' FROM class_enrollments JOIN class_sessions ON class_sessions.class_run_id = class_enrollments.class_run_id LEFT JOIN class_student_bookings ON class_student_bookings.class_session_id = class_sessions.id AND class_student_bookings.enrollment_id = class_enrollments.id WHERE class_enrollments.class_run_id = ? AND class_student_bookings.id IS NULL", values: [runId] },
    { sql: "INSERT OR IGNORE INTO class_attendance (id, student_booking_id, status, note) SELECT 'my-att-' || class_student_bookings.id, class_student_bookings.id, 'pending', '' FROM class_student_bookings JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id LEFT JOIN class_attendance ON class_attendance.student_booking_id = class_student_bookings.id WHERE class_sessions.class_run_id = ? AND class_attendance.id IS NULL", values: [runId] },
  ]));
  await execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", ["malaysia_term_sample_v3", "true"]);
}

async function ensureRichCampusSampleData() {
  const completed = await row("SELECT value FROM app_settings WHERE key = ?", ["rich_campus_sample_v4"]);
  if (completed) return;
  const rooms = [
    ["room-c203", "C-203", "C-203", "Campus One, Level 2", 18, "classroom", "Whiteboard, projector", 570, 76, 190, 116],
    ["room-d204", "D-204", "D-204", "Campus One, Level 2", 18, "classroom", "Whiteboard, projector", 92, 302, 190, 116],
    ["room-e205", "E-205", "E-205", "Campus One, Level 2", 14, "studio", "Flexible tables, display", 572, 302, 190, 116],
  ];
  await executeBatch(rooms.map(([idValue, code, name, location, capacity, roomType, resources, mapX, mapY, mapWidth, mapHeight]) => ({ sql: "INSERT OR IGNORE INTO classrooms (id, code, name, location, capacity, status, campus_id, room_type, resources, map_x, map_y, map_width, map_height) VALUES (?, ?, ?, ?, ?, 'active', 'campus-one', ?, ?, ?, ?, ?, ?)", values: [idValue, code, name, location, capacity, roomType, resources, mapX, mapY, mapWidth, mapHeight] })));
  await executeBatch([
    { sql: "UPDATE classrooms SET map_x = 92, map_y = 76, map_width = 190, map_height = 116 WHERE id = 'room-a201'", values: [] },
    { sql: "UPDATE classrooms SET map_x = 332, map_y = 76, map_width = 190, map_height = 116 WHERE id = 'room-b102'", values: [] },
    { sql: "UPDATE classrooms SET map_x = 332, map_y = 302, map_width = 190, map_height = 116 WHERE id = 'room-m301'", values: [] },
  ]);
  const students = ["Hana Aziz", "Izzat Hakim", "Mei Xin", "Kavin Raj", "Nur Iman", "Sofia Lim", "Arjun Kumar", "Chloe Tan", "Ethan Goh", "Priya Nair", "Rayyan Ali", "Zara Lee"];
  await executeBatch(students.map((name, index) => ({ sql: "INSERT OR IGNORE INTO students (id, code, name, level, guardian_phone, status) VALUES (?, ?, ?, ?, ?, 'active')", values: [`student-rich-${index + 1}`, `STU-${String(index + 17).padStart(3, '0')}`, name, index % 4 === 0 ? "Year 8" : "Year 7", `012-660${String(index + 110).padStart(4, '0')}`] })));
  const runs = [
    ["run-eng-y7-mon", "ENG-Y7-2026-MON", "course-english-y7", "English Year 7 - Monday PM", 18, 390, "room-c203", "teacher-olivia", "16:00", 90],
    ["run-mth-y7-wed", "MTH-Y7-2026-WED", "course-math-y7", "Mathematics Year 7 - Wednesday PM", 18, 420, "room-b102", "teacher-sophia", "16:00", 85],
    ["run-chn-y7-thu", "CHN-Y7-2026-THU", "course-chinese-y7", "Chinese Year 7 - Thursday PM", 18, 360, "room-a201", "teacher-zhang", "15:30", 90],
    ["run-sci-y7-fri", "SCI-Y7-2026-FRI", "course-science-y7", "Science Year 7 - Friday PM", 18, 400, "room-d204", "teacher-aina", "16:00", 92],
    ["run-bm-y7-tue", "BM-Y7-2026-TUE", "course-bm-y7", "Bahasa Melayu Year 7 - Tuesday PM", 18, 360, "room-e205", "teacher-nurul", "16:00", 82],
  ] as const;
  await executeBatch(runs.map(([idValue, code, courseId, name, capacity, price]) => ({ sql: "INSERT OR IGNORE INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at) VALUES (?, ?, ?, 'term-current', ?, ?, ?, 'open', '2026-07-15 09:00', '2026-09-30 18:00')", values: [idValue, code, courseId, name, capacity, price] })));
  const dates = ["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"];
  const weekdays = { mon: dates, tue: dates.map((date) => later(`${date} 00:00`, 1440).slice(0, 10)), wed: dates.map((date) => later(`${date} 00:00`, 2880).slice(0, 10)), thu: dates.map((date) => later(`${date} 00:00`, 4320).slice(0, 10)), fri: dates.map((date) => later(`${date} 00:00`, 5760).slice(0, 10)) };
  const plans = runs.map((run, index) => [run, Object.values(weekdays)[index]] as const);
  await executeBatch(plans.flatMap(([run, runDates]) => runDates.map((date, index) => { const startsAt = `${date} ${run[8]}`; const sessionId = `rich-${run[0]}-${String(index + 1).padStart(2, '0')}`; return [
    { sql: "INSERT OR IGNORE INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')", values: [sessionId, run[0], index + 1, `Lesson ${index + 1}`, startsAt, later(startsAt, 90)] },
    { sql: "INSERT OR IGNORE INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'reserved')", values: [`rb-${sessionId}`, sessionId, run[6], startsAt, later(startsAt, 90)] },
    { sql: "INSERT OR IGNORE INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, 'unpaid', 'confirmed')", values: [`tb-${sessionId}`, sessionId, run[7], startsAt, later(startsAt, 90), run[9]] },
  ]; })).flat());
  const learnerIds = ["student-allen", "student-may", "student-jerry", "student-lina", "student-aisha", "student-daniel", "student-yuna", "student-sara", "student-noah", ...students.map((_, index) => `student-rich-${index + 1}`)];
  const enrollmentRows = runs.flatMap(([runId, , , , , price], runIndex) => learnerIds.slice(runIndex, runIndex + 10).map((studentId) => [runId, studentId, price] as const));
  await executeBatch(enrollmentRows.flatMap(([runId, studentId, fee]) => [
    { sql: "INSERT OR IGNORE INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, enrolled_at) VALUES (?, ?, ?, ?, 'enrolled', CURRENT_TIMESTAMP)", values: [`rich-enr-${runId}-${studentId}`, runId, studentId, fee] },
    { sql: "INSERT OR IGNORE INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at) VALUES (?, ?, ?, ?, ?, 0, 'unpaid', CURRENT_TIMESTAMP, '2026-08-15')", values: [`rich-inv-${runId}-${studentId}`, `RICH-${runId}-${studentId}`, `rich-enr-${runId}-${studentId}`, studentId, fee] },
  ]));
  await executeBatch(runs.flatMap(([runId]) => [
    { sql: "INSERT OR IGNORE INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status) SELECT 'rich-sb-' || class_enrollments.id || '-' || class_sessions.id, class_sessions.id, class_enrollments.id, class_enrollments.student_id, ROUND(class_enrollments.contracted_fee / 10, 2), 'booked' FROM class_enrollments JOIN class_sessions ON class_sessions.class_run_id = class_enrollments.class_run_id WHERE class_enrollments.class_run_id = ?", values: [runId] },
    { sql: "INSERT OR IGNORE INTO class_attendance (id, student_booking_id, status, note) SELECT 'rich-att-' || class_student_bookings.id, class_student_bookings.id, 'pending', '' FROM class_student_bookings JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id WHERE class_sessions.class_run_id = ?", values: [runId] },
  ]));
  await execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", ["rich_campus_sample_v4", "true"]);
}

async function ensureCourseIntakeSampleData() {
  const completed = await row("SELECT value FROM app_settings WHERE key = ?", ["course_intakes_v5"]);
  if (completed) return;

  const names = [
    ["April 2026 · Completed", "run-eng-y7-history"],
    ["July 2026 · Wednesday PM", "run-english-y7-a"],
    ["July 2026 · Monday PM", "run-eng-y7-mon"],
    ["July 2026 · Saturday AM", "run-chinese-y7-a"],
    ["July 2026 · Saturday AM", "run-math-y7-a"],
    ["July 2026 · Wednesday PM", "run-mth-y7-wed"],
    ["July 2026 · Thursday PM", "run-chn-y7-thu"],
    ["July 2026 · Friday PM", "run-sci-y7-fri"],
    ["July 2026 · Tuesday PM", "run-bm-y7-tue"],
    ["July 2026 · Saturday PM", "run-science-y7-a"],
    ["July 2026 · Sunday AM", "run-english-y8-a"],
  ];
  const lessonPlans = [
    ["run-eng-y7-mon", ["Reading for meaning", "Vocabulary in context", "Sentence crafting", "Narrative structure", "Descriptive writing", "Grammar in use", "Speaking and listening", "Informative writing", "Editing workshop", "English review"]],
    ["run-mth-y7-wed", ["Fractions and decimals", "Equivalent fractions", "Decimal operations", "Percentages", "Ratio and proportion", "Algebraic expressions", "Linear equations", "Geometry and angles", "Data handling", "Maths revision"]],
    ["run-chn-y7-thu", ["Reading foundations", "Writing practice", "Vocabulary in context", "Informative texts", "Sentence structure", "Narrative writing", "Reading comprehension", "Grammar review", "Speaking practice", "Chinese review"]],
    ["run-sci-y7-fri", ["Laboratory safety", "Cells and life", "Matter and materials", "Forces in action", "Heat transfer", "Light and shadows", "Ecosystems", "Scientific investigation", "Practical skills", "Science review"]],
    ["run-bm-y7-tue", ["Kefahaman asas", "Tatabahasa", "Perbendaharaan kata", "Penulisan perenggan", "Karangan naratif", "Karangan fakta", "Lisan dan komunikasi", "Pemahaman teks", "Teknik menjawab", "Ulang kaji"]],
  ] as const;
  await executeBatch(names.map(([name, runId]) => ({ sql: "UPDATE class_runs SET name = ? WHERE id = ?", values: [name, runId] })));
  await executeBatch(lessonPlans.flatMap(([runId, topics]) => topics.map((topic, index) => ({ sql: "UPDATE class_sessions SET topic = ? WHERE class_run_id = ? AND session_no = ?", values: [topic, runId, index + 1] }))));

  const runId = "run-eng-y7-aug";
  const dates = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"];
  const topics = ["Reading for meaning", "Vocabulary in context", "Sentence crafting", "Narrative structure", "Descriptive writing", "Grammar in use", "Speaking and listening", "Informative writing", "Editing workshop", "English review"];
  const learners = ["student-allen", "student-may", "student-jerry", "student-lina", "student-aisha", "student-daniel", "student-yuna", "student-sara", "student-noah", "student-rich-1"];
  await executeBatch([
    { sql: "INSERT OR IGNORE INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values: [runId, "ENG-Y7-2026-AUG", "course-english-y7", "term-current", "August 2026 · Monday PM", 18, 390, "open", "2026-07-20 09:00", "2026-08-17 18:00"] },
    ...dates.flatMap((date, index) => {
      const startsAt = `${date} 17:45`;
      const endsAt = later(startsAt, 90);
      const sessionId = `session-eng-y7-aug-${String(index + 1).padStart(2, "0")}`;
      return [
        { sql: "INSERT OR IGNORE INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')", values: [sessionId, runId, index + 1, topics[index], startsAt, endsAt] },
        { sql: "INSERT OR IGNORE INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'reserved')", values: [`rb-${sessionId}`, sessionId, "room-c203", startsAt, endsAt] },
        { sql: "INSERT OR IGNORE INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, 'unpaid', 'confirmed')", values: [`tb-${sessionId}`, sessionId, "teacher-farid", startsAt, endsAt, 90] },
      ];
    }),
    ...learners.flatMap((studentId) => {
      const enrollmentId = `enr-${runId}-${studentId}`;
      return [
        { sql: "INSERT OR IGNORE INTO class_enrollments (id, class_run_id, student_id, contracted_fee, status, enrolled_at) VALUES (?, ?, ?, ?, 'enrolled', '2026-07-21 09:00')", values: [enrollmentId, runId, studentId, 390] },
        { sql: "INSERT OR IGNORE INTO student_invoices (id, invoice_no, enrollment_id, student_id, total_amount, paid_amount, status, issued_at, due_at) VALUES (?, ?, ?, ?, ?, 0, 'unpaid', '2026-07-21 09:00', '2026-08-10')", values: [`inv-${runId}-${studentId}`, `ENG-AUG-${studentId}`, enrollmentId, studentId, 390] },
      ];
    }),
  ]);
  await executeBatch([
    { sql: "INSERT OR IGNORE INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status) SELECT 'sb-' || class_enrollments.id || '-' || class_sessions.id, class_sessions.id, class_enrollments.id, class_enrollments.student_id, 39, 'booked' FROM class_enrollments JOIN class_sessions ON class_sessions.class_run_id = class_enrollments.class_run_id WHERE class_enrollments.class_run_id = ?", values: [runId] },
    { sql: "INSERT OR IGNORE INTO class_attendance (id, student_booking_id, status, note) SELECT 'att-' || class_student_bookings.id, class_student_bookings.id, 'pending', '' FROM class_student_bookings JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id WHERE class_sessions.class_run_id = ?", values: [runId] },
    { sql: "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", values: ["course_intakes_v5", "true"] },
  ]);
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
  const courseId = id("course");
  await execute(
    "INSERT INTO course_catalogs (id, code, title, subject, level, default_sessions, default_minutes, list_price, display_color, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [courseId, code, title, payload.subject?.trim() || "General", payload.level?.trim() || "Mixed", count, Math.max(30, number(payload.minutes, 90)), number(payload.price), courseColour(payload.color), "active"],
  );
  await executeBatch(Array.from({ length: count }, (_, index) => ({ sql: "INSERT INTO course_lesson_templates (id, course_id, lesson_no, title, default_duration_minutes) VALUES (?, ?, ?, ?, ?)", values: [id("lesson-template"), courseId, index + 1, `Lesson ${index + 1}`, Math.max(30, number(payload.minutes, 90))] })));
}

type LessonTemplateInput = { title?: unknown; durationMinutes?: unknown };

async function saveCourseLessons(payload: ActionPayload) {
  if (!payload.courseId) throw new Error("Course not found.");
  let draft: unknown[] = [];
  try { draft = JSON.parse(payload.lessonPlan || "[]"); } catch { throw new Error("Unable to read the lesson plan."); }
  const lessons = draft.map((item) => typeof item === "string" ? { title: item } : item as LessonTemplateInput)
    .map((item) => ({ title: String(item.title ?? "").trim(), duration: Math.max(30, number(item.durationMinutes, 90)) }))
    .filter((item) => item.title);
  if (!lessons.length) throw new Error("Add at least one lesson to the course plan.");
  const course = await row<{ default_minutes: number }>("SELECT default_minutes FROM course_catalogs WHERE id = ?", [payload.courseId]);
  if (!course) throw new Error("Course not found.");
  await execute("DELETE FROM course_lesson_templates WHERE course_id = ?", [payload.courseId]);
  await executeBatch(lessons.map((lesson, index) => ({ sql: "INSERT INTO course_lesson_templates (id, course_id, lesson_no, title, default_duration_minutes, default_teacher_id, default_classroom_id, default_pay_amount) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0)", values: [id("lesson-template"), payload.courseId, index + 1, lesson.title, lesson.duration || Math.max(30, number(course.default_minutes, 90))] })));
  await execute("UPDATE course_catalogs SET default_sessions = ? WHERE id = ?", [lessons.length, payload.courseId]);
}

function selectedSessionIds(value: unknown) {
  try {
    const ids = JSON.parse(String(value ?? "[]"));
    return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  } catch { return []; }
}

async function applyClassAssignments(payload: ActionPayload) {
  if (!payload.runId || !payload.teacherId || !payload.classroomId) throw new Error("Choose a teacher and classroom.");
  const picked = selectedSessionIds(payload.sessionIds);
  const all = await rows<{ id: string; topic: string; starts_at: string; ends_at: string }>("SELECT id, topic, starts_at, ends_at FROM class_sessions WHERE class_run_id = ? ORDER BY starts_at, session_no", [payload.runId]);
  const sessions = picked.length ? all.filter((session) => picked.includes(session.id)) : all;
  if (!sessions.length) throw new Error("No lessons are available to update.");
  const duration = Math.max(30, number(payload.durationMinutes, minutesBetween(sessions[0].starts_at, sessions[0].ends_at)));
  const students = await rows<{ student_id: string; name: string }>("SELECT students.id AS student_id, students.name FROM class_enrollments JOIN students ON students.id = class_enrollments.student_id WHERE class_enrollments.class_run_id = ? AND class_enrollments.status = 'enrolled'", [payload.runId]);
  const planned = sessions.map((session) => ({ ...session, ends_at: later(session.starts_at, duration) }));
  for (const session of planned) {
    const roomConflicts = await rows<{ starts_at: string; ends_at: string }>("SELECT starts_at, ends_at FROM class_resource_bookings WHERE classroom_id = ? AND class_session_id != ? AND status != 'cancelled'", [payload.classroomId, session.id]);
    if (roomConflicts.some((item) => overlaps(session.starts_at, session.ends_at, item.starts_at, item.ends_at))) throw new Error(`The classroom is not available for ${session.topic}.`);
    const teacherConflicts = await rows<{ starts_at: string; ends_at: string }>("SELECT starts_at, ends_at FROM class_teacher_bookings WHERE teacher_id = ? AND class_session_id != ? AND status != 'cancelled'", [payload.teacherId, session.id]);
    if (teacherConflicts.some((item) => overlaps(session.starts_at, session.ends_at, item.starts_at, item.ends_at))) throw new Error(`The teacher is not available for ${session.topic}.`);
    for (const student of students) {
      const conflicts = await rows<{ starts_at: string; ends_at: string }>("SELECT class_sessions.starts_at, class_sessions.ends_at FROM class_student_bookings JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id WHERE class_student_bookings.student_id = ? AND class_student_bookings.class_session_id != ? AND class_student_bookings.status != 'cancelled'", [student.student_id, session.id]);
      if (conflicts.some((item) => overlaps(session.starts_at, session.ends_at, item.starts_at, item.ends_at))) throw new Error(`${student.name} has another class at ${session.topic}.`);
    }
  }
  for (const session of planned) {
    await execute("UPDATE class_sessions SET ends_at = ? WHERE id = ?", [session.ends_at, session.id]);
    const roomBooking = await row<{ id: string }>("SELECT id FROM class_resource_bookings WHERE class_session_id = ?", [session.id]);
    if (roomBooking) await execute("UPDATE class_resource_bookings SET classroom_id = ?, starts_at = ?, ends_at = ?, status = 'reserved' WHERE id = ?", [payload.classroomId, session.starts_at, session.ends_at, roomBooking.id]);
    else await execute("INSERT INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'reserved')", [id("room-booking"), session.id, payload.classroomId, session.starts_at, session.ends_at]);
    const teacherBooking = await row<{ id: string }>("SELECT id FROM class_teacher_bookings WHERE class_session_id = ?", [session.id]);
    if (teacherBooking) await execute("UPDATE class_teacher_bookings SET teacher_id = ?, starts_at = ?, ends_at = ?, pay_amount = ? WHERE id = ?", [payload.teacherId, session.starts_at, session.ends_at, number(payload.payAmount), teacherBooking.id]);
    else await execute("INSERT INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, 'unpaid', 'confirmed')", [id("teacher-booking"), session.id, payload.teacherId, session.starts_at, session.ends_at, number(payload.payAmount)]);
  }
  const teacher = await row<{ name: string }>("SELECT name FROM teachers WHERE id = ?", [payload.teacherId]);
  const room = await row<{ name: string }>("SELECT name FROM classrooms WHERE id = ?", [payload.classroomId]);
  const message = `${sessions.length} lesson${sessions.length === 1 ? "" : "s"} updated with ${teacher?.name ?? "the selected teacher"} in ${room?.name ?? "the selected classroom"}.`;
  await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, ?, ?, ?, ?, 'unread')", [id("notice"), "teacher", payload.teacherId, "Class assignment updated", message]);
  for (const student of students) await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, ?, ?, ?, ?, 'unread')", [id("notice"), "student", student.student_id, "Class assignment updated", message]);
}

function minutesBetween(startsAt: string, endsAt: string) {
  const start = new Date(startsAt.replace(" ", "T")).getTime();
  const end = new Date(endsAt.replace(" ", "T")).getTime();
  return Math.max(30, Math.round((end - start) / 60000));
}

async function resortClassLessons(payload: ActionPayload) {
  if (!payload.runId) throw new Error("Class not found.");
  const run = await row<{ course_id: string }>("SELECT course_id FROM class_runs WHERE id = ?", [payload.runId]);
  if (!run) throw new Error("Class not found.");
  const sessions = await rows<{ id: string }>("SELECT id FROM class_sessions WHERE class_run_id = ? ORDER BY starts_at, ends_at, id", [payload.runId]);
  const templates = await rows<{ lesson_no: number; title: string }>("SELECT lesson_no, title FROM course_lesson_templates WHERE course_id = ? ORDER BY lesson_no", [run.course_id]);
  if (!sessions.length || !templates.length) throw new Error("Schedule lessons and save the Course plan before sorting.");
  await executeBatch(sessions.map((session, index) => ({ sql: "UPDATE class_sessions SET session_no = ?, topic = ? WHERE id = ?", values: [index + 1, templates[index]?.title ?? `Lesson ${index + 1}`, session.id] })));
}

async function createClassRun(payload: ActionPayload) {
  if (!payload.courseId || !payload.termId || !payload.languageId || !payload.teacherId) throw new Error("Please select a course, term, teaching language and class teacher.");
  const course = await row<{ title: string; list_price: number }>("SELECT title, list_price FROM course_catalogs WHERE id = ?", [payload.courseId]);
  if (!course) throw new Error("Course not found.");
  const compatibleTeacher = await row("SELECT 1 AS available FROM teacher_languages WHERE teacher_id = ? AND language_id = ?", [payload.teacherId, payload.languageId]);
  if (!compatibleTeacher) throw new Error("The selected teacher is not set up for this teaching language.");
  const code = `RUN-${Date.now().toString().slice(-6)}`;
  await execute(
    "INSERT INTO class_runs (id, code, course_id, term_id, name, capacity, price, status, enrollment_open_at, enrollment_close_at, language_id, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id("run"), code, payload.courseId, payload.termId, payload.name?.trim() || `${course.title} class`, Math.max(1, Math.floor(number(payload.capacity, 16))), number(payload.price, course.list_price), "open", localDate(-1), localDate(30), payload.languageId, payload.teacherId],
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

async function updateSession(payload: ActionPayload) {
  if (!payload.sessionId || !payload.classroomId || !payload.teacherId) throw new Error("Please select the lesson time, classroom and teacher.");
  const current = await row<{ class_run_id: string; topic: string; starts_at: string; ends_at: string }>("SELECT class_run_id, topic, starts_at, ends_at FROM class_sessions WHERE id = ?", [payload.sessionId]);
  if (!current) throw new Error("Lesson not found.");
  const startsAt = payload.startsAt?.replace("T", " ");
  const endsAt = payload.endsAt?.replace("T", " ");
  if (!startsAt || !endsAt || new Date(startsAt.replace(" ", "T")) >= new Date(endsAt.replace(" ", "T"))) throw new Error("End time must be later than start time.");
  const roomConflicts = await rows<{ class_session_id: string; starts_at: string; ends_at: string }>("SELECT class_session_id, starts_at, ends_at FROM class_resource_bookings WHERE classroom_id = ? AND class_session_id != ? AND status != 'cancelled'", [payload.classroomId, payload.sessionId]);
  if (roomConflicts.some((item) => overlaps(startsAt, endsAt, item.starts_at, item.ends_at))) throw new Error("This classroom is already booked for that time.");
  const teacherConflicts = await rows<{ class_session_id: string; starts_at: string; ends_at: string }>("SELECT class_session_id, starts_at, ends_at FROM class_teacher_bookings WHERE teacher_id = ? AND class_session_id != ? AND status != 'cancelled'", [payload.teacherId, payload.sessionId]);
  if (teacherConflicts.some((item) => overlaps(startsAt, endsAt, item.starts_at, item.ends_at))) throw new Error("This teacher is already booked for that time.");
  const bookedStudents = await rows<{ student_id: string; name: string }>("SELECT class_student_bookings.student_id, students.name FROM class_student_bookings JOIN students ON students.id = class_student_bookings.student_id WHERE class_student_bookings.class_session_id = ?", [payload.sessionId]);
  for (const student of bookedStudents) {
    const conflicts = await rows<{ class_session_id: string; starts_at: string; ends_at: string }>("SELECT class_student_bookings.class_session_id, class_sessions.starts_at, class_sessions.ends_at FROM class_student_bookings JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id WHERE class_student_bookings.student_id = ? AND class_student_bookings.class_session_id != ? AND class_student_bookings.status != 'cancelled'", [student.student_id, payload.sessionId]);
    if (conflicts.some((item) => overlaps(startsAt, endsAt, item.starts_at, item.ends_at))) throw new Error(`${student.name} is already booked for this time.`);
  }
  await execute("UPDATE class_sessions SET topic = ?, starts_at = ?, ends_at = ? WHERE id = ?", [payload.topic?.trim() || current.topic, startsAt, endsAt, payload.sessionId]);
  await execute("UPDATE class_resource_bookings SET classroom_id = ?, starts_at = ?, ends_at = ? WHERE class_session_id = ?", [payload.classroomId, startsAt, endsAt, payload.sessionId]);
  await execute("UPDATE class_teacher_bookings SET teacher_id = ?, starts_at = ?, ends_at = ? WHERE class_session_id = ?", [payload.teacherId, startsAt, endsAt, payload.sessionId]);
  const classroom = await row<{ name: string }>("SELECT name FROM classrooms WHERE id = ?", [payload.classroomId]);
  const title = "Lesson updated";
  const body = `${payload.topic?.trim() || current.topic} is now scheduled for ${startsAt} in ${classroom?.name ?? "the classroom"}.`;
  await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, ?, ?, ?, ?, 'unread')", [id("notice"), "teacher", payload.teacherId, title, body]);
  for (const student of bookedStudents) await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, ?, ?, ?, ?, 'unread')", [id("notice"), "student", student.student_id, title, body]);
}

function weeklyDateTime(startDate: string, startTime: string, weekOffset: number) {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + weekOffset * 7));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${startTime}`;
}

type WeeklySlot = { anchorDate: string; weekday: number; startTime: string; endTime: string; teacherId: string; classroomId: string };
type PlannedSession = { id: string; session_no: number; topic: string; exists: boolean; startsAt?: string; endsAt?: string; teacherId?: string; classroomId?: string };

function parsedWeeklySlots(payload: ActionPayload): WeeklySlot[] {
  let slots: WeeklySlot[] = [];
  try { slots = JSON.parse(payload.weeklySlots || "[]") as WeeklySlot[]; } catch { throw new Error("Unable to read the weekly schedule."); }
  if (!slots.length && payload.startDate && payload.startTime && payload.teacherId && payload.classroomId) {
    const start = String(payload.startTime);
    slots = [{ anchorDate: String(payload.startDate), weekday: new Date(`${payload.startDate}T12:00`).getDay(), startTime: start, endTime: later(`2000-01-01 ${start}`, Math.max(30, number(payload.durationMinutes, 90))).slice(11), teacherId: String(payload.teacherId), classroomId: String(payload.classroomId) }];
  }
  const clean = slots.map((slot) => ({
    anchorDate: String(slot.anchorDate || ""), weekday: Math.max(0, Math.min(6, Number(slot.weekday))), startTime: String(slot.startTime || ""), endTime: String(slot.endTime || ""), teacherId: String(slot.teacherId || ""), classroomId: String(slot.classroomId || ""),
  }));
  if (!clean.length || clean.some((slot) => !slot.anchorDate || !slot.startTime || !slot.endTime || !slot.teacherId || !slot.classroomId || minutesBetween(`2000-01-01 ${slot.startTime}`, `2000-01-01 ${slot.endTime}`) < 30)) throw new Error("Add at least one weekly time with a teacher and classroom.");
  return clean;
}

function firstWeeklyDate(anchorDate: string, weekday: number) {
  const date = new Date(`${anchorDate}T12:00:00`);
  while (date.getDay() !== weekday) date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function configureClassRun(payload: ActionPayload) {
  if (!payload.runId) throw new Error("Class not found.");
  const run = await row<{ course_id: string }>("SELECT course_id FROM class_runs WHERE id = ?", [payload.runId]);
  if (!run) throw new Error("Class not found.");
  const slots = parsedWeeklySlots(payload);
  const templates = await rows<{ lesson_no: number; title: string }>("SELECT lesson_no, title FROM course_lesson_templates WHERE course_id = ? ORDER BY lesson_no", [run.course_id]);
  const existing = await rows<{ id: string; session_no: number; topic: string }>("SELECT id, session_no, topic FROM class_sessions WHERE class_run_id = ? ORDER BY session_no", [payload.runId]);
  let sessions: PlannedSession[] = existing.map((session) => ({ ...session, exists: true }));
  if (sessions.length < templates.length) {
    const existingNumbers = new Set(sessions.map((session) => session.session_no));
    sessions = [
      ...sessions,
      ...templates.filter((lesson) => !existingNumbers.has(lesson.lesson_no)).map((lesson) => ({ id: id("session"), session_no: lesson.lesson_no, topic: lesson.title, exists: false })),
    ].sort((left, right) => left.session_no - right.session_no);
  }
  if (!sessions.length) throw new Error("Add at least one lesson to the Course plan before scheduling this class.");
  const studentRows = await rows<{ student_id: string; name: string }>("SELECT students.id AS student_id, students.name FROM class_enrollments JOIN students ON students.id = class_enrollments.student_id WHERE class_enrollments.class_run_id = ? AND class_enrollments.status = 'enrolled'", [payload.runId]);
  const occurrences = slots.flatMap((slot) => Array.from({ length: sessions.length }, (_, index) => {
    const startsAt = weeklyDateTime(firstWeeklyDate(slot.anchorDate, slot.weekday), slot.startTime, index);
    return { startsAt, endsAt: later(startsAt, minutesBetween(`2000-01-01 ${slot.startTime}`, `2000-01-01 ${slot.endTime}`)), teacherId: slot.teacherId, classroomId: slot.classroomId };
  })).sort((left, right) => left.startsAt.localeCompare(right.startsAt)).slice(0, sessions.length);
  const planned = sessions.map((session, index) => ({ ...session, ...occurrences[index] }));
  for (const [index, session] of planned.entries()) for (const previous of planned.slice(0, index)) {
    if (session.classroomId === previous.classroomId && overlaps(session.startsAt, session.endsAt, previous.startsAt, previous.endsAt)) throw new Error("Two weekly times overlap in the same classroom.");
    if (session.teacherId === previous.teacherId && overlaps(session.startsAt, session.endsAt, previous.startsAt, previous.endsAt)) throw new Error("Two weekly times overlap for the same teacher.");
  }
  for (const session of planned) {
    const roomConflicts = await rows<{ class_session_id: string; starts_at: string; ends_at: string }>("SELECT class_session_id, starts_at, ends_at FROM class_resource_bookings WHERE classroom_id = ? AND class_session_id NOT IN (SELECT id FROM class_sessions WHERE class_run_id = ?) AND status != 'cancelled'", [session.classroomId, payload.runId]);
    if (roomConflicts.some((item) => overlaps(session.startsAt, session.endsAt, item.starts_at, item.ends_at))) throw new Error(`The classroom is not available for lesson ${session.session_no}.`);
    const teacherConflicts = await rows<{ class_session_id: string; starts_at: string; ends_at: string }>("SELECT class_session_id, starts_at, ends_at FROM class_teacher_bookings WHERE teacher_id = ? AND class_session_id NOT IN (SELECT id FROM class_sessions WHERE class_run_id = ?) AND status != 'cancelled'", [session.teacherId, payload.runId]);
    if (teacherConflicts.some((item) => overlaps(session.startsAt, session.endsAt, item.starts_at, item.ends_at))) throw new Error(`The teacher is not available for lesson ${session.session_no}.`);
    for (const student of studentRows) {
      const conflicts = await rows<{ starts_at: string; ends_at: string }>("SELECT class_sessions.starts_at, class_sessions.ends_at FROM class_student_bookings JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id WHERE class_student_bookings.student_id = ? AND class_sessions.class_run_id != ? AND class_student_bookings.status != 'cancelled'", [student.student_id, payload.runId]);
      if (conflicts.some((item) => overlaps(session.startsAt, session.endsAt, item.starts_at, item.ends_at))) throw new Error(`${student.name} has another class at lesson ${session.session_no}.`);
    }
  }
  for (const session of planned) {
    if (!session.exists) await execute("INSERT INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')", [session.id, payload.runId, session.session_no, session.topic, session.startsAt, session.endsAt]);
    else await execute("UPDATE class_sessions SET starts_at = ?, ends_at = ?, status = 'scheduled' WHERE id = ?", [session.startsAt, session.endsAt, session.id]);
    const resource = await row<{ id: string }>("SELECT id FROM class_resource_bookings WHERE class_session_id = ?", [session.id]);
    if (resource) await execute("UPDATE class_resource_bookings SET classroom_id = ?, starts_at = ?, ends_at = ?, status = 'reserved' WHERE id = ?", [session.classroomId, session.startsAt, session.endsAt, resource.id]);
    else await execute("INSERT INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'reserved')", [id("room-booking"), session.id, session.classroomId, session.startsAt, session.endsAt]);
    const teacherBooking = await row<{ id: string }>("SELECT id FROM class_teacher_bookings WHERE class_session_id = ?", [session.id]);
    if (teacherBooking) await execute("UPDATE class_teacher_bookings SET teacher_id = ?, starts_at = ?, ends_at = ?, pay_amount = 0 WHERE id = ?", [session.teacherId, session.startsAt, session.endsAt, teacherBooking.id]);
    else await execute("INSERT INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, 0, 'unpaid', 'confirmed')", [id("teacher-booking"), session.id, session.teacherId, session.startsAt, session.endsAt]);
  }
  const notice = `Class schedule updated: ${sessions.length} lessons have been placed using ${slots.length} weekly time${slots.length === 1 ? "" : "s"}.`;
  for (const teacherId of Array.from(new Set(planned.map((session) => session.teacherId)))) await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, ?, ?, ?, ?, 'unread')", [id("notice"), "teacher", teacherId, "Class schedule updated", notice]);
  for (const student of studentRows) await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, ?, ?, ?, ?, 'unread')", [id("notice"), "student", student.student_id, "Class schedule updated", notice]);
}

async function syncClassLessons(payload: ActionPayload) {
  if (!payload.runId) throw new Error("Class not found.");
  const run = await row<{ course_id: string }>("SELECT course_id FROM class_runs WHERE id = ?", [payload.runId]);
  if (!run) throw new Error("Class not found.");
  const templates = await rows<{ lesson_no: number; title: string; default_duration_minutes: number }>("SELECT lesson_no, title, default_duration_minutes FROM course_lesson_templates WHERE course_id = ? ORDER BY lesson_no", [run.course_id]);
  const sessions = await rows<{ id: string; session_no: number; topic: string; starts_at: string; ends_at: string }>("SELECT id, session_no, topic, starts_at, ends_at FROM class_sessions WHERE class_run_id = ? ORDER BY session_no", [payload.runId]);
  if (!templates.length) throw new Error("Add lessons to the Course plan first.");
  if (!sessions.length) throw new Error("Use Quick schedule to place the first class lessons.");
  const missing = templates.filter((template) => !sessions.some((session) => session.session_no === template.lesson_no));
  if (!missing.length) return;
  const last = sessions.at(-1)!;
  const previous = sessions.at(-2);
  const gapMinutes = previous ? Math.max(30, Math.round((new Date(last.starts_at.replace(" ", "T")).getTime() - new Date(previous.starts_at.replace(" ", "T")).getTime()) / 60000)) : 7 * 24 * 60;
  const lastStart = new Date(last.starts_at.replace(" ", "T")).getTime();
  const lastTeacher = await row<{ teacher_id: string; pay_amount: number }>("SELECT teacher_id, pay_amount FROM class_teacher_bookings WHERE class_session_id = ?", [last.id]);
  const lastRoom = await row<{ classroom_id: string }>("SELECT classroom_id FROM class_resource_bookings WHERE class_session_id = ?", [last.id]);
  if (!lastTeacher?.teacher_id || !lastRoom?.classroom_id) throw new Error("Set a teacher and classroom before updating the class schedule.");
  const enrollments = await rows<{ id: string; student_id: string; contracted_fee: number }>("SELECT id, student_id, contracted_fee FROM class_enrollments WHERE class_run_id = ? AND status = 'enrolled'", [payload.runId]);
  for (const [index, template] of missing.entries()) {
    const startsAt = new Date(lastStart + gapMinutes * 60000 * (index + 1));
    const startText = `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, "0")}-${String(startsAt.getDate()).padStart(2, "0")} ${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}`;
    const endsAt = later(startText, Math.max(30, number(template.default_duration_minutes, minutesBetween(last.starts_at, last.ends_at))));
    const sessionId = id("session");
    await execute("INSERT INTO class_sessions (id, class_run_id, session_no, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')", [sessionId, payload.runId, template.lesson_no, template.title, startText, endsAt]);
    await execute("INSERT INTO class_resource_bookings (id, class_session_id, classroom_id, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, 'reserved')", [id("room-booking"), sessionId, lastRoom.classroom_id, startText, endsAt]);
    await execute("INSERT INTO class_teacher_bookings (id, class_session_id, teacher_id, starts_at, ends_at, pay_amount, pay_status, status) VALUES (?, ?, ?, ?, ?, ?, 'unpaid', 'confirmed')", [id("teacher-booking"), sessionId, lastTeacher.teacher_id, startText, endsAt, number(lastTeacher.pay_amount)]);
  }
  const totalSessions = await row<{ count: number }>("SELECT COUNT(*) AS count FROM class_sessions WHERE class_run_id = ?", [payload.runId]);
  const allSessions = await rows<{ id: string }>("SELECT id FROM class_sessions WHERE class_run_id = ? ORDER BY session_no", [payload.runId]);
  for (const enrollment of enrollments) {
    const allocated = Math.round((number(enrollment.contracted_fee) / Math.max(1, number(totalSessions?.count))) * 100) / 100;
    await execute("UPDATE class_student_bookings SET allocated_fee = ? WHERE enrollment_id = ?", [allocated, enrollment.id]);
    for (const session of allSessions) {
      const exists = await row<{ id: string }>("SELECT id FROM class_student_bookings WHERE class_session_id = ? AND enrollment_id = ?", [session.id, enrollment.id]);
      if (exists) continue;
      const bookingId = id("student-booking");
      await execute("INSERT INTO class_student_bookings (id, class_session_id, enrollment_id, student_id, allocated_fee, status) VALUES (?, ?, ?, ?, ?, 'booked')", [bookingId, session.id, enrollment.id, enrollment.student_id, allocated]);
      await execute("INSERT INTO class_attendance (id, student_booking_id, status, note) VALUES (?, ?, 'pending', '')", [id("attendance"), bookingId]);
    }
  }
  const notice = `${missing.length} new lesson${missing.length === 1 ? "" : "s"} added to this class schedule.`;
  await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, 'teacher', ?, 'Class schedule updated', ?, 'unread')", [id("notice"), lastTeacher.teacher_id, notice]);
  for (const enrollment of enrollments) await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, 'student', ?, 'Class schedule updated', ?, 'unread')", [id("notice"), enrollment.student_id, notice]);
}

async function deleteCourse(payload: ActionPayload) {
  if (!payload.courseId) throw new Error("Course not found.");
  const enrolled = await row<{ count: number }>("SELECT COUNT(*) AS count FROM class_enrollments JOIN class_runs ON class_runs.id = class_enrollments.class_run_id WHERE class_runs.course_id = ?", [payload.courseId]);
  if (number(enrolled?.count) > 0) throw new Error("This course has student records and cannot be deleted.");
  const sessionIds = "SELECT id FROM class_sessions WHERE class_run_id IN (SELECT id FROM class_runs WHERE course_id = ?)";
  await execute(`DELETE FROM class_attendance WHERE student_booking_id IN (SELECT id FROM class_student_bookings WHERE class_session_id IN (${sessionIds}))`, [payload.courseId]);
  await execute(`DELETE FROM class_student_bookings WHERE class_session_id IN (${sessionIds})`, [payload.courseId]);
  await execute(`DELETE FROM class_resource_bookings WHERE class_session_id IN (${sessionIds})`, [payload.courseId]);
  await execute(`DELETE FROM class_teacher_bookings WHERE class_session_id IN (${sessionIds})`, [payload.courseId]);
  await execute(`DELETE FROM class_sessions WHERE class_run_id IN (SELECT id FROM class_runs WHERE course_id = ?)`, [payload.courseId]);
  await execute("DELETE FROM class_runs WHERE course_id = ?", [payload.courseId]);
  await execute("DELETE FROM course_lesson_templates WHERE course_id = ?", [payload.courseId]);
  await execute("DELETE FROM course_catalogs WHERE id = ?", [payload.courseId]);
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
  const existing = await row<{ id: string }>("SELECT id FROM class_enrollments WHERE class_run_id = ? AND student_id = ?", [runId, studentId]);
  if (existing) {
    if (!checkCapacity) return { enrollmentId: existing.id, invoiceId: "" };
    throw new Error("This student is already enrolled in the class.");
  }

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
  return { enrollmentId, invoiceId };
}

async function createStudentForEnrollment(payload: ActionPayload) {
  const label = payload.studentName?.trim();
  if (!label) throw new Error("Please select or add a student.");
  const studentId = id("student");
  await execute(
    "INSERT INTO students (id, code, name, level, guardian_phone, email, avatar_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [studentId, `STU-${Date.now().toString().slice(-6)}`, label, payload.studentLevel?.trim() || "Year 7", payload.studentPhone?.trim() || "", payload.studentEmail?.trim() || "", payload.avatarUrl?.trim() || "sprite:0", "active"],
  );
  return studentId;
}

async function enrollStudentWithPayment(payload: ActionPayload) {
  const studentId = payload.studentId || await createStudentForEnrollment(payload);
  const payNow = payload.payNow === true || payload.payNow === "true";
  const fee = number(payload.contractedFee, number(payload.price));
  const result = await enrollStudent(payload.runId, studentId, fee || undefined);
  if (payNow) await recordPayment({ ...payload, invoiceId: result.invoiceId });
}

async function recordPayment(payload: ActionPayload) {
  if (!payload.invoiceId) throw new Error("Invoice not found.");
  const invoice = await row<{ id: string; student_id: string; enrollment_id: string; total_amount: number; paid_amount: number }>(
    "SELECT id, student_id, enrollment_id, total_amount, paid_amount FROM student_invoices WHERE id = ?", [payload.invoiceId],
  );
  if (!invoice) throw new Error("Invoice not found.");
  const discount = Math.min(Math.max(0, number(payload.discount)), Math.max(0, number(invoice.total_amount) - number(invoice.paid_amount)));
  const adjustedTotal = Math.round((number(invoice.total_amount) - discount) * 100) / 100;
  const remaining = Math.max(0, adjustedTotal - number(invoice.paid_amount));
  const amount = Math.min(Math.max(0.01, number(payload.amount, remaining)), remaining);
  const paid = Math.round((number(invoice.paid_amount) + amount) * 100) / 100;
  const status = paid >= adjustedTotal ? "paid" : "partly_paid";
  await execute("INSERT INTO student_payments (id, invoice_id, student_id, amount, method, proof_reference, note, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)", [id("payment"), invoice.id, invoice.student_id, amount, payload.method || "duitnow_qr", payload.proofReference?.trim() ?? "", payload.note?.trim() ?? ""]);
  await execute("UPDATE student_invoices SET total_amount = ?, paid_amount = ?, status = ? WHERE id = ?", [adjustedTotal, paid, status, invoice.id]);
}

async function setAttendance(payload: ActionPayload) {
  if (!payload.studentBookingId) throw new Error("Student booking not found.");
  await execute(
    "UPDATE class_attendance SET status = ?, note = ?, marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?",
    [payload.attendanceStatus ?? "present", payload.note?.trim() ?? "", payload.studentBookingId],
  );
}

async function requestLeave(payload: ActionPayload) {
  if (!payload.sessionId || !payload.studentId) throw new Error("Lesson booking not found.");
  const booking = await row<{ id: string }>("SELECT id FROM class_student_bookings WHERE class_session_id = ? AND student_id = ?", [payload.sessionId, payload.studentId]);
  if (!booking) throw new Error("Lesson booking not found.");
  await execute("UPDATE class_attendance SET status = ?, note = ?, marked_at = CURRENT_TIMESTAMP WHERE student_booking_id = ?", ["leave", "Requested by student", booking.id]);
}

async function sendMessage(payload: ActionPayload) {
  if (!payload.studentId || !payload.recipient || !payload.subject?.trim() || !payload.body?.trim()) throw new Error("Email details are incomplete.");
  await execute("INSERT INTO student_messages (id, student_id, recipient, subject, body, direction, status) VALUES (?, ?, ?, ?, ?, ?, ?)", [id("message"), payload.studentId, payload.recipient, payload.subject.trim(), payload.body.trim(), "outbound", "prepared"]);
}

async function updateEntity(payload: ActionPayload) {
  if (payload.action === "updateCourse" && payload.courseId) {
    await execute("UPDATE course_catalogs SET title = ?, subject = ?, level = ?, default_sessions = ?, default_minutes = ?, list_price = ?, display_color = ? WHERE id = ?", [payload.title?.trim() || "Untitled course", payload.subject?.trim() || "General", payload.level?.trim() || "Mixed", Math.max(1, number(payload.sessions, 1)), Math.max(30, number(payload.minutes, 30)), number(payload.price), courseColour(payload.color), payload.courseId]);
  }
  if (payload.action === "updateRun" && payload.runId) {
    await execute("UPDATE class_runs SET name = ?, capacity = ?, price = ? WHERE id = ?", [payload.name?.trim() || "Untitled class", Math.max(1, number(payload.capacity, 1)), number(payload.price), payload.runId]);
  }
  if (payload.action === "updateStudent" && payload.studentId) {
    await execute("UPDATE students SET name = ?, level = ?, guardian_phone = ?, email = ?, avatar_url = COALESCE(NULLIF(?, ''), avatar_url) WHERE id = ?", [payload.name?.trim() || "Untitled student", payload.level?.trim() || "Unassigned", payload.phone?.trim() || "", payload.email?.trim() || "", payload.avatarUrl?.trim() || "", payload.studentId]);
  }
  if (payload.action === "updateTeacher" && payload.teacherId) {
    await execute("UPDATE teachers SET name = ?, subject = ?, phone = ? WHERE id = ?", [payload.name?.trim() || "Untitled teacher", payload.subject?.trim() || "General", payload.phone?.trim() || "", payload.teacherId]);
  }
}

async function createBaseRecord(payload: ActionPayload) {
  const label = payload.name?.trim() || "Untitled";
  if (payload.action === "createStudent") {
    await execute(
      "INSERT INTO students (id, code, name, level, guardian_phone, email, avatar_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id("student"), `STU-${Date.now().toString().slice(-6)}`, label, payload.level?.trim() || "Unassigned", payload.phone?.trim() || "", payload.email?.trim() || "", payload.avatarUrl?.trim() || "sprite:0", "active"],
    );
  }
  if (payload.action === "createTeacher") {
    await execute(
      "INSERT INTO teachers (id, code, name, subject, phone, status) VALUES (?, ?, ?, ?, ?, ?)",
      [id("teacher"), `TCH-${Date.now().toString().slice(-6)}`, label, payload.subject?.trim() || "General", payload.phone?.trim() || "", "available"],
    );
  }
  if (payload.action === "createClassroom") {
    const campus = payload.campusId
      ? await row<{ id: string; name: string }>("SELECT id, name FROM campuses WHERE id = ?", [payload.campusId])
      : await row<{ id: string; name: string }>("SELECT id, name FROM campuses WHERE status = 'active' ORDER BY code LIMIT 1");
    if (!campus) throw new Error("Create a campus before adding a classroom.");
    await execute(
      "INSERT INTO classrooms (id, code, name, location, campus_id, capacity, room_type, resources, map_x, map_y, map_width, map_height, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id("room"), `ROOM-${Date.now().toString().slice(-5)}`, label, payload.location?.trim() || campus.name, campus.id, Math.max(1, Math.floor(number(payload.capacity, 12))), payload.roomType?.trim() || "classroom", payload.resources?.trim() || "", 80, 80, 180, 110, "active"],
    );
  }
}

async function createCampus(payload: ActionPayload) {
  const name = payload.name?.trim() || "New campus";
  await execute(
    "INSERT INTO campuses (id, code, name, address, map_label, status) VALUES (?, ?, ?, ?, ?, ?)",
    [id("campus"), `CAMPUS-${Date.now().toString().slice(-6)}`, name, payload.address?.trim() || "", payload.mapLabel?.trim() || "Level 1", "active"],
  );
}

async function updateCampus(payload: ActionPayload) {
  if (!payload.campusId) throw new Error("Campus not found.");
  await execute(
    "UPDATE campuses SET name = ?, address = ?, map_label = ? WHERE id = ?",
    [payload.name?.trim() || "Untitled campus", payload.address?.trim() || "", payload.mapLabel?.trim() || "Level 1", payload.campusId],
  );
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

async function updateBusinessHours(payload: ActionPayload) {
  const start = validTime(payload.businessStart);
  const end = validTime(payload.businessEnd);
  if (!start || !end || end <= start) throw new Error("Please enter a valid operating time range.");
  let days = [1, 2, 3, 4, 5, 6, 0];
  try { const parsed = JSON.parse(payload.businessDays || "[]"); if (Array.isArray(parsed) && parsed.length) days = parsed.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6); } catch { /* Keep the full-week default. */ }
  if (!days.length) throw new Error("Choose at least one operating day.");
  await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", ["business_hours", JSON.stringify({ start, end, days })]);
}

async function setCurrentLesson(payload: ActionPayload) {
  if (!payload.sessionId) throw new Error("Lesson not found.");
  const session = await row<{ class_run_id: string; topic: string }>("SELECT class_run_id, topic FROM class_sessions WHERE id = ?", [payload.sessionId]);
  if (!session) throw new Error("Lesson not found.");
  await execute("UPDATE class_sessions SET status = 'scheduled' WHERE class_run_id = ? AND status = 'current'", [session.class_run_id]);
  await execute("UPDATE class_sessions SET status = 'current' WHERE id = ?", [payload.sessionId]);
  const students = await rows<{ student_id: string }>("SELECT student_id FROM class_enrollments WHERE class_run_id = ? AND status = 'enrolled'", [session.class_run_id]);
  const notice = `${session.topic} is now the current lesson.`;
  for (const student of students) await execute("INSERT INTO portal_notifications (id, recipient_type, recipient_id, title, body, status) VALUES (?, 'student', ?, 'Current lesson updated', ?, 'unread')", [id("notice"), student.student_id, notice]);
}

async function updateMailSettings(payload: ActionPayload) {
  await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", ["mail_settings", JSON.stringify({ sender: payload.sender?.trim() ?? "", inboundProtocol: payload.inboundProtocol === "POP3" ? "POP3" : "IMAP", inboundHost: payload.inboundHost?.trim() ?? "", inboundPort: payload.inboundPort?.trim() ?? "", smtpHost: payload.smtpHost?.trim() ?? "", smtpPort: payload.smtpPort?.trim() ?? "" })]);
}

async function updateCampusFloorplan(payload: ActionPayload) {
  if (!payload.campusId || !payload.mapImage) throw new Error("Please choose a floor plan image.");
  if (!payload.mapImage.startsWith("data:image/") || payload.mapImage.length > 1_800_000) throw new Error("Use a PNG or JPG floor plan smaller than 1.3 MB.");
  await execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [`floorplan_${payload.campusId}`, payload.mapImage]);
}

async function readAttendance() {
  return rows(`SELECT class_attendance.id, class_attendance.student_booking_id, class_attendance.status, class_attendance.note, class_attendance.marked_at,
    class_student_bookings.class_session_id, class_student_bookings.student_id, class_student_bookings.allocated_fee,
    students.name AS student_name, class_sessions.class_run_id
    FROM class_attendance JOIN class_student_bookings ON class_student_bookings.id = class_attendance.student_booking_id JOIN students ON students.id = class_student_bookings.student_id
    JOIN class_sessions ON class_sessions.id = class_student_bookings.class_session_id ORDER BY class_sessions.starts_at ASC`);
}

async function readPortal(includeAttendance = false) {
  await seedDatabase();
  const [terms, courses, courseLessons, runs, sessions, students, teachers, languages, teacherLanguages, campuses, classrooms, enrollments, invoices, payments, messages, notifications, attendance, resourceBookings, teacherBookings, businessHoursSetting, mailSettingsSetting] = await Promise.all([
    rows("SELECT * FROM academic_terms ORDER BY starts_on DESC"),
    rows(`SELECT course_catalogs.*, COUNT(DISTINCT class_runs.id) AS run_count FROM course_catalogs LEFT JOIN class_runs ON class_runs.course_id = course_catalogs.id GROUP BY course_catalogs.id ORDER BY course_catalogs.code`),
    rows(`SELECT course_lesson_templates.*, teachers.name AS teacher_name, classrooms.name AS classroom_name
          FROM course_lesson_templates
          LEFT JOIN teachers ON teachers.id = course_lesson_templates.default_teacher_id
          LEFT JOIN classrooms ON classrooms.id = course_lesson_templates.default_classroom_id
          ORDER BY course_lesson_templates.course_id, course_lesson_templates.lesson_no`),
    rows(`SELECT class_runs.*, course_catalogs.title AS course_title, course_catalogs.subject, course_catalogs.display_color AS run_course_color, academic_terms.name AS term_name, teaching_languages.name AS language_name, teaching_languages.display_color AS language_color, teachers.name AS teacher_name, MIN(class_sessions.starts_at) AS starts_at, MAX(class_sessions.ends_at) AS ends_at, COUNT(DISTINCT class_sessions.id) AS session_count, COUNT(DISTINCT class_enrollments.id) AS student_count
          FROM class_runs JOIN course_catalogs ON course_catalogs.id = class_runs.course_id JOIN academic_terms ON academic_terms.id = class_runs.term_id
          LEFT JOIN teaching_languages ON teaching_languages.id = class_runs.language_id LEFT JOIN teachers ON teachers.id = class_runs.teacher_id
          LEFT JOIN class_sessions ON class_sessions.class_run_id = class_runs.id LEFT JOIN class_enrollments ON class_enrollments.class_run_id = class_runs.id AND class_enrollments.status = 'enrolled'
          GROUP BY class_runs.id ORDER BY class_runs.created_at DESC`),
    rows(`SELECT class_sessions.*, class_runs.name AS run_name, class_runs.code AS run_code, course_catalogs.title AS course_title, course_catalogs.display_color AS course_color, class_resource_bookings.classroom_id, classrooms.name AS classroom_name, class_teacher_bookings.teacher_id, teachers.name AS teacher_name, class_teacher_bookings.pay_amount AS pay_amount, class_teacher_bookings.pay_status
          FROM class_sessions JOIN class_runs ON class_runs.id = class_sessions.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id
          LEFT JOIN class_resource_bookings ON class_resource_bookings.class_session_id = class_sessions.id LEFT JOIN classrooms ON classrooms.id = class_resource_bookings.classroom_id
          LEFT JOIN class_teacher_bookings ON class_teacher_bookings.class_session_id = class_sessions.id LEFT JOIN teachers ON teachers.id = class_teacher_bookings.teacher_id
          ORDER BY class_sessions.starts_at ASC`),
    rows("SELECT * FROM students ORDER BY code"),
    rows(`SELECT teachers.*, COALESCE(GROUP_CONCAT(teaching_languages.name, ' · '), '') AS language_names
          FROM teachers LEFT JOIN teacher_languages ON teacher_languages.teacher_id = teachers.id LEFT JOIN teaching_languages ON teaching_languages.id = teacher_languages.language_id
          GROUP BY teachers.id ORDER BY teachers.code`),
    rows("SELECT * FROM teaching_languages ORDER BY code"),
    rows("SELECT * FROM teacher_languages ORDER BY teacher_id, language_id"),
    rows("SELECT campuses.*, COALESCE((SELECT value FROM app_settings WHERE key = 'floorplan_' || campuses.id), '') AS floorplan_url FROM campuses ORDER BY code"),
    rows(`SELECT classrooms.*, campuses.name AS campus_name, campuses.map_label AS campus_map_label
          FROM classrooms LEFT JOIN campuses ON campuses.id = classrooms.campus_id
          ORDER BY campuses.code, classrooms.code`),
    rows(`SELECT class_enrollments.*, students.name AS student_name, students.guardian_phone, students.email AS student_email, class_runs.name AS run_name, class_runs.code AS run_code, class_runs.status AS run_status, course_catalogs.title AS course_title, student_invoices.id AS invoice_id, student_invoices.invoice_no, student_invoices.total_amount, student_invoices.paid_amount, student_invoices.status AS invoice_status
          FROM class_enrollments JOIN students ON students.id = class_enrollments.student_id JOIN class_runs ON class_runs.id = class_enrollments.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id
          LEFT JOIN student_invoices ON student_invoices.enrollment_id = class_enrollments.id ORDER BY class_enrollments.enrolled_at DESC`),
    rows(`SELECT student_invoices.*, students.name AS student_name, class_runs.name AS run_name, course_catalogs.title AS course_title
          FROM student_invoices JOIN students ON students.id = student_invoices.student_id JOIN class_enrollments ON class_enrollments.id = student_invoices.enrollment_id JOIN class_runs ON class_runs.id = class_enrollments.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id ORDER BY student_invoices.issued_at DESC`),
    rows(`SELECT student_payments.*, student_invoices.invoice_no, class_runs.name AS run_name, course_catalogs.title AS course_title, students.name AS student_name
          FROM student_payments JOIN student_invoices ON student_invoices.id = student_payments.invoice_id JOIN class_enrollments ON class_enrollments.id = student_invoices.enrollment_id
          JOIN class_runs ON class_runs.id = class_enrollments.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id JOIN students ON students.id = student_payments.student_id
          ORDER BY student_payments.received_at DESC`),
    rows("SELECT * FROM student_messages ORDER BY created_at DESC"),
    rows("SELECT * FROM portal_notifications ORDER BY created_at DESC LIMIT 80"),
    includeAttendance ? readAttendance() : Promise.resolve([] as Row[]),
    rows(`SELECT class_resource_bookings.*, classrooms.name AS classroom_name, class_sessions.topic, class_sessions.starts_at AS session_starts_at, class_runs.name AS run_name, course_catalogs.title AS course_title
          FROM class_resource_bookings JOIN classrooms ON classrooms.id = class_resource_bookings.classroom_id JOIN class_sessions ON class_sessions.id = class_resource_bookings.class_session_id
          JOIN class_runs ON class_runs.id = class_sessions.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id ORDER BY class_resource_bookings.starts_at ASC`),
    rows(`SELECT class_teacher_bookings.*, teachers.name AS teacher_name, class_sessions.topic, class_runs.id AS class_run_id, class_runs.name AS run_name, class_runs.status AS run_status, course_catalogs.title AS course_title, course_catalogs.display_color AS course_color
          FROM class_teacher_bookings JOIN teachers ON teachers.id = class_teacher_bookings.teacher_id JOIN class_sessions ON class_sessions.id = class_teacher_bookings.class_session_id
          JOIN class_runs ON class_runs.id = class_sessions.class_run_id JOIN course_catalogs ON course_catalogs.id = class_runs.course_id ORDER BY class_teacher_bookings.starts_at ASC`),
    row<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", ["business_hours"]),
    row<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", ["mail_settings"]),
  ]);

  const conflictRows = [
    ...await findConflicts(resourceBookings, "classroom_id", "classroom_name", "Classroom"),
    ...await findConflicts(teacherBookings, "teacher_id", "teacher_name", "Teacher"),
  ];
  const outstanding = invoices.reduce((sum, invoice) => sum + Math.max(0, number(invoice.total_amount) - number(invoice.paid_amount)), 0);
  let businessHours: { start: string; end: string; days: number[]; source: "configured" | "bookings" } | null = null;
  try {
    const parsed = JSON.parse(businessHoursSetting?.value ?? "") as { start?: string; end?: string; days?: number[] };
    const start = validTime(parsed.start); const end = validTime(parsed.end);
    const days = Array.isArray(parsed.days) && parsed.days.length ? parsed.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [1, 2, 3, 4, 5, 6, 0];
    if (start && end && end > start) businessHours = { start, end, days, source: "configured" };
  } catch { /* Fall back to the booked lesson range. */ }
  if (!businessHours) {
    const starts = sessions.map((item) => String(item.starts_at).slice(11, 16)).filter(validTime).sort();
    const ends = sessions.map((item) => String(item.ends_at).slice(11, 16)).filter(validTime).sort();
    businessHours = { start: starts[0] ?? "08:00", end: ends.at(-1) ?? "20:00", days: [1, 2, 3, 4, 5, 6, 0], source: "bookings" };
  }
  let mail = { sender: "", inboundProtocol: "IMAP", inboundHost: "", inboundPort: "993", smtpHost: "", smtpPort: "587" };
  try { mail = { ...mail, ...JSON.parse(mailSettingsSetting?.value ?? "{}") }; } catch { /* Use connection defaults. */ }
  return Response.json({
    terms, courses, courseLessons, runs, sessions, students, teachers, languages, teacherLanguages, campuses, classrooms, enrollments, invoices, payments, messages, notifications, attendance, resourceBookings, teacherBookings, conflicts: conflictRows,
    settings: { businessHours, mail },
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

export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get("scope") === "attendance") {
      await seedDatabase();
      return Response.json({ attendance: await readAttendance() });
    }
    return await readPortal();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load data." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await seedDatabase();
    const payload = await request.json<ActionPayload>();
    if (payload.action === "resetClientTeachingPlan") {
      await resetToClientTeachingPlan();
      return await readPortal();
    }
    if (payload.action === "refreshClientPlanStudentNames") {
      await refreshClientPlanStudentNames();
      return await readPortal();
    }
    if (payload.action === "expandPpmCourseProducts") {
      await expandPpmCourseProducts();
      return await readPortal();
    }
    if (payload.action === "setAttendance") {
      await setAttendance(payload);
      return Response.json({ attendanceUpdate: { studentBookingId: payload.studentBookingId, status: payload.attendanceStatus ?? "present", note: payload.note ?? "" } });
    }
    if (payload.action === "createCourse") await createCourse(payload);
    if (payload.action === "saveCourseLessons") await saveCourseLessons(payload);
    if (payload.action === "createClassRun") await createClassRun(payload);
    if (payload.action === "createSession") await createSession(payload);
    if (payload.action === "updateSession") await updateSession(payload);
    if (payload.action === "configureClassRun") await configureClassRun(payload);
    if (payload.action === "syncClassLessons") await syncClassLessons(payload);
    if (payload.action === "deleteCourse") await deleteCourse(payload);
    if (payload.action === "applyClassAssignments") await applyClassAssignments(payload);
    if (payload.action === "resortClassLessons") await resortClassLessons(payload);
    if (payload.action === "enrollStudent") await enrollStudent(payload.runId, payload.studentId);
    if (payload.action === "enrollStudentWithPayment") await enrollStudentWithPayment(payload);
    if (payload.action === "recordPayment") await recordPayment(payload);
    if (payload.action === "requestLeave") await requestLeave(payload);
    if (payload.action === "sendMessage") await sendMessage(payload);
    if (payload.action === "updateCourse" || payload.action === "updateRun" || payload.action === "updateStudent" || payload.action === "updateTeacher") await updateEntity(payload);
    if (payload.action === "createCampus") await createCampus(payload);
    if (payload.action === "updateCampus") await updateCampus(payload);
    if (payload.action === "createStudent" || payload.action === "createTeacher" || payload.action === "createClassroom") await createBaseRecord(payload);
    if (payload.action === "updateClassroomMap") await updateClassroomMap(payload);
    if (payload.action === "updateBusinessHours") await updateBusinessHours(payload);
    if (payload.action === "setCurrentLesson") await setCurrentLesson(payload);
    if (payload.action === "updateMailSettings") await updateMailSettings(payload);
    if (payload.action === "updateCampusFloorplan") await updateCampusFloorplan(payload);
    return await readPortal(payload.action === "enrollStudent" || payload.action === "enrollStudentWithPayment");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save data." }, { status: 400 });
  }
}
