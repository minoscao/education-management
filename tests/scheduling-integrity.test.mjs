import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { fixture, load } from "./workflow-fixture.mjs";

const { MonthlyTimetable } = await load("monthly-timetable");
const { ensureSchedulingSchema } = await load("scheduling-schema");
const lesson = {
  sessionId: "lesson-a",
  runId: "run-primary",
  topic: "Reading",
  startsAt: "2099-03-02 09:00",
  endsAt: "2099-03-02 10:00",
  classroomId: "room",
  teacherId: "teacher",
};
async function setup() {
  const f = fixture(),
    service = new MonthlyTimetable(f.adapter);
  await service.prepareAssignments();
  f.db.exec(
    "UPDATE class_runs SET language_id='language',teacher_id='teacher'",
  );
  await service.saveTeacher({
    teacherId: "teacher",
    reviewStatus: "approved",
    qualifications: "Teaching degree",
    allowedCourses: ["primary", "secondary"],
    availability: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      start: "08:00",
      end: "18:00",
    })),
  });
  return { ...f, service };
}
const count = (f, table) =>
  f.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
function book(f, sessionId, studentId = "student") {
  if (!f.db.prepare("SELECT id FROM students WHERE id=?").get(studentId))
    f.insert("students", { id: studentId, code: studentId, name: studentId });
  if (
    !f.db
      .prepare("SELECT id FROM class_enrollments WHERE id=?")
      .get(`enrol-${studentId}`)
  )
    f.insert("class_enrollments", {
      id: `enrol-${studentId}`,
      class_run_id: "run-primary",
      student_id: studentId,
    });
  f.insert("class_student_bookings", {
    id: `booking-${sessionId}-${studentId}`,
    class_session_id: sessionId,
    enrollment_id: `enrol-${studentId}`,
    student_id: studentId,
    payment_source: "course",
    delivery_mode: "onsite",
  });
}

test("manual scheduling enforces teacher approval, course, language, availability and classroom size", async () => {
  const f = await setup();
  try {
    const cases = [
      [
        "UPDATE teacher_profiles SET review_status='candidate'",
        /qualifications/,
      ],
      [
        "UPDATE teacher_profiles SET review_status='approved'; UPDATE teachers SET status='inactive'",
        /qualifications/,
      ],
      [
        "UPDATE teachers SET status='available'; UPDATE teacher_profiles SET allowed_courses='[]'",
        /not approved for this course/,
      ],
      [
        "UPDATE teacher_profiles SET allowed_courses='[\"primary\"]',availability='[]'",
        /availability/,
      ],
      [
        'UPDATE teacher_profiles SET availability=\'[{"weekday":1,"start":"08:00","end":"18:00"}]\'; DELETE FROM teacher_languages',
        /language/,
      ],
    ];
    for (const [sql, expected] of cases) {
      f.db.exec(sql);
      await assert.rejects(f.service.createSession(lesson), expected);
      assert.equal(count(f, "class_sessions"), 0);
    }
    f.insert("teacher_languages", {
      teacher_id: "teacher",
      language_id: "language",
    });
    f.db.exec("UPDATE classrooms SET capacity=15");
    await assert.rejects(f.service.createSession(lesson), /enough seats/);
    f.db.exec("UPDATE classrooms SET capacity=16,status='inactive'");
    await assert.rejects(f.service.createSession(lesson), /active classroom/);
  } finally {
    f.close();
  }
});

test("successful new lessons create resources without silently expanding student purchases", async () => {
  const f = await setup();
  try {
    f.insert("students", { id: "student", code: "student", name: "Student" });
    f.insert("class_enrollments", {
      id: "enrol-student",
      class_run_id: "run-primary",
      student_id: "student",
    });
    await f.service.createSession(lesson);
    assert.equal(count(f, "class_sessions"), 1);
    assert.equal(count(f, "class_resource_bookings"), 1);
    assert.equal(count(f, "class_teacher_bookings"), 1);
    assert.equal(count(f, "class_student_bookings"), 0);
    assert.equal(count(f, "scheduling_guards"), 0);
  } finally {
    f.close();
  }
});

test("two prepared overlapping writes cannot both commit and leave no orphan lesson", async () => {
  const f = await setup();
  try {
    const a = await f.service.prepareCreateSession(lesson),
      b = await f.service.prepareCreateSession({
        ...lesson,
        sessionId: "lesson-b",
      });
    await f.service.commit(a.queries);
    await assert.rejects(f.service.commit(b.queries), /resources changed/);
    assert.equal(count(f, "class_sessions"), 1);
    assert.equal(count(f, "class_resource_bookings"), 1);
    assert.equal(count(f, "class_teacher_bookings"), 1);
  } finally {
    f.close();
  }
});

test("resource shrink, teacher review race and interrupted inserts roll back every scheduling record", async () => {
  for (const race of [
    (f) => f.db.exec("UPDATE classrooms SET capacity=15"),
    (f) => f.db.exec("UPDATE teacher_profiles SET review_status='rejected'"),
  ]) {
    const f = await setup();
    try {
      f.beforeBatch(() => race(f));
      await assert.rejects(
        f.service.createSession(lesson),
        /resources changed/,
      );
      assert.equal(count(f, "class_sessions"), 0);
      assert.equal(count(f, "class_resource_bookings"), 0);
      assert.equal(count(f, "class_session_changes"), 0);
    } finally {
      f.close();
    }
  }
  const f = await setup();
  try {
    f.interrupt(3);
    await assert.rejects(
      f.service.createSession(lesson),
      /Injected interruption/,
    );
    for (const t of [
      "class_sessions",
      "class_resource_bookings",
      "class_teacher_bookings",
      "scheduling_guards",
    ])
      assert.equal(count(f, t), 0);
  } finally {
    f.close();
  }
});

test("a concurrent study visit rejects creation before any lesson or resource survives", async () => {
  const f = await setup();
  try {
    f.insert("students", {
      id: "study-student",
      code: "study-student",
      name: "Study learner",
    });
    f.beforeBatch(() =>
      f.insert("study_bookings", {
        id: "visit",
        student_id: "study-student",
        classroom_id: "room",
        starts_at: lesson.startsAt,
        ends_at: lesson.endsAt,
        status: "booked",
      }),
    );
    await assert.rejects(f.service.createSession(lesson), /resources changed/);
    assert.equal(count(f, "class_sessions"), 0);
    assert.equal(count(f, "class_resource_bookings"), 0);
  } finally {
    f.close();
  }
});

test("moving booked lessons detects student overlap even with different teachers and rooms", async () => {
  const f = await setup();
  try {
    await f.service.createSession(lesson);
    await f.service.createSession({
      ...lesson,
      sessionId: "lesson-b",
      startsAt: "2099-03-02 11:00",
      endsAt: "2099-03-02 12:00",
    });
    book(f, "lesson-a");
    book(f, "lesson-b");
    f.insert("classrooms", {
      id: "room-b",
      code: "room-b",
      name: "Room B",
      capacity: 16,
    });
    f.insert("teachers", {
      id: "teacher-b",
      code: "teacher-b",
      name: "Teacher B",
    });
    f.insert("teacher_languages", {
      teacher_id: "teacher-b",
      language_id: "language",
    });
    await f.service.saveTeacher({
      teacherId: "teacher-b",
      reviewStatus: "approved",
      qualifications: "Degree",
      allowedCourses: ["primary"],
      availability: [{ weekday: 1, start: "08:00", end: "18:00" }],
    });
    await assert.rejects(
      f.service.updateSession({
        ...lesson,
        startsAt: "2099-03-02 11:00",
        endsAt: "2099-03-02 12:00",
        classroomId: "room-b",
        teacherId: "teacher-b",
      }),
      /resources changed/,
    );
    assert.equal(
      f.db
        .prepare("SELECT starts_at FROM class_sessions WHERE id='lesson-a'")
        .get().starts_at,
      lesson.startsAt,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT classroom_id FROM class_resource_bookings WHERE class_session_id='lesson-a'",
        )
        .get().classroom_id,
      "room",
    );
  } finally {
    f.close();
  }
});

test("cancellation cancels reservations atomically and editing cannot reopen the lesson", async () => {
  const f = await setup();
  try {
    await f.service.createSession(lesson);
    book(f, "lesson-a");
    await f.service.cancelSession({ sessionId: "lesson-a" });
    for (const table of [
      "class_sessions",
      "class_resource_bookings",
      "class_teacher_bookings",
      "class_student_bookings",
    ])
      assert.equal(
        f.db.prepare(`SELECT status FROM ${table}`).get().status,
        "cancelled",
      );
    await assert.rejects(
      f.service.updateSession({
        ...lesson,
        startsAt: "2099-03-09 09:00",
        endsAt: "2099-03-09 10:00",
      }),
      /make-up lesson/,
    );
    assert.equal(
      f.db.prepare("SELECT status FROM class_student_bookings").get().status,
      "cancelled",
    );
    await f.service.cancelSession({ sessionId: "lesson-a" });
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM class_session_changes WHERE change_type='cancelled'",
        )
        .get().n,
      1,
    );
  } finally {
    f.close();
  }
});

test("a completion racing cancellation is preserved", async () => {
  const f = await setup();
  try {
    await f.service.createSession(lesson);
    f.beforeBatch(() =>
      f.db.exec("UPDATE class_sessions SET status='completed'"),
    );
    await assert.rejects(
      f.service.cancelSession({ sessionId: "lesson-a" }),
      /resources changed/,
    );
    assert.equal(
      f.db.prepare("SELECT status FROM class_sessions").get().status,
      "completed",
    );
    assert.equal(
      f.db.prepare("SELECT status FROM class_resource_bookings").get().status,
      "reserved",
    );
  } finally {
    f.close();
  }
});

test("course deletion cleans known prerequisites and rolls back all changes on an unknown dependent record", async () => {
  for (const linked of [false, true]) {
    const f = await setup();
    try {
      await f.service.createSession(lesson);
      f.insert("course_requirements", {
        course_id: "primary",
        prerequisites: "Read first",
      });
      if (linked) {
        f.db.exec(
          "CREATE TABLE additional_history(id TEXT PRIMARY KEY,course_id TEXT REFERENCES course_catalogs(id)); INSERT INTO additional_history VALUES('history','primary')",
        );
        await assert.rejects(
          f.service.deleteCourse({ courseId: "primary" }),
          /Nothing was deleted/,
        );
        for (const table of [
          "class_sessions",
          "class_resource_bookings",
          "class_teacher_bookings",
          "course_requirements",
        ])
          assert.equal(count(f, table), 1);
      } else {
        await f.service.deleteCourse({ courseId: "primary" });
        assert.equal(
          f.db
            .prepare("SELECT id FROM course_catalogs WHERE id='primary'")
            .get(),
          undefined,
        );
        for (const table of [
          "class_sessions",
          "class_resource_bookings",
          "class_teacher_bookings",
          "course_requirements",
        ])
          assert.equal(count(f, table), 0);
      }
    } finally {
      f.close();
    }
  }
});

test("publication revalidates inactive rooms, campuses and reduced capacity", async () => {
  for (const update of [
    "UPDATE classrooms SET status='inactive'",
    "UPDATE classrooms SET capacity=15",
    "INSERT INTO campuses(id,code,name,status) VALUES('inactive','inactive','Inactive campus','inactive'); UPDATE classrooms SET campus_id='inactive'",
  ]) {
    const f = await setup();
    try {
      await f.service.createSession(lesson);
      f.db.exec("UPDATE class_runs SET status='draft' WHERE id='run-primary'");
      f.db.exec(update);
      await assert.rejects(
        f.service.publish({ runId: "run-primary" }),
        /active classroom/,
      );
      assert.equal(
        f.db
          .prepare("SELECT status FROM class_runs WHERE id='run-primary'")
          .get().status,
        "draft",
      );
    } finally {
      f.close();
    }
  }
});

test("editing a template updates its slot without duplicating it; yearly previews use a fixed query count", async () => {
  const f = await setup();
  try {
    const slot = {
      slotId: "weekly",
      classroomId: "room",
      weekday: 1,
      startsTime: "09:00",
      endsTime: "10:00",
      kind: "lesson",
      courseId: "primary",
      teacherId: "teacher",
      languageId: "language",
      capacity: 12,
    };
    await f.service.saveSlot(slot);
    await f.service.saveSlot({
      ...slot,
      startsTime: "10:00",
      endsTime: "11:00",
      label: "Updated",
    });
    assert.equal(count(f, "classroom_time_slots"), 1);
    assert.equal(
      f.db.prepare("SELECT label FROM classroom_time_slots").get().label,
      "Updated",
    );
    await assert.rejects(
      f.service.saveSlot({ ...slot, capacity: 0 }),
      /Capacity/,
    );
    let reads = 0;
    const measured = new MonthlyTimetable({
      ...f.adapter,
      prepare(sql) {
        reads++;
        return f.adapter.prepare(sql);
      },
    });
    const preview = await measured.preview({
      classroomId: "room",
      month: "2099-01",
      repeats: 12,
      termId: "term",
    });
    assert.ok(preview.occurrences.length >= 52);
    assert.equal(reads, 5);
  } finally {
    f.close();
  }
});

test("compatibility preflight is repeatable and migration preserves existing template data", async () => {
  const f = fixture();
  try {
    await ensureSchedulingSchema(f.adapter);
    await ensureSchedulingSchema(f.adapter);
    f.insert("course_lesson_templates", {
      id: "template",
      course_id: "primary",
      lesson_no: 1,
      title: "Keep this",
    });
    f.db.exec(
      readFileSync(
        new URL("../drizzle/0031_scheduling_integrity.sql", import.meta.url),
        "utf8",
      ),
    );
    await ensureSchedulingSchema(f.adapter);
    assert.equal(
      f.db.prepare("SELECT title FROM course_lesson_templates").get().title,
      "Keep this",
    );
  } finally {
    f.close();
  }
});

// Compile the actual legacy route functions so its wrappers cannot silently bypass the shared service.
function legacy(f) {
  const source = ts.createSourceFile(
    "route.ts",
    readFileSync(
      new URL("../app/api/portal-data/route.ts", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = [
    "createSession",
    "updateSession",
    "cancelSession",
    "deleteCourse",
    "parsedWeeklySlots",
    "firstWeeklyDate",
    "swapSessionOrder",
    "configureClassRun",
    "syncClassLessons",
    "applyClassAssignments",
    "selectedSessionIds",
    "minutesBetween",
    "weeklyDateTime",
  ];
  const picked = source.statements
    .filter((s) => ts.isFunctionDeclaration(s) && names.includes(s.name?.text))
    .map((s) => s.getText(source))
    .join("\n");
  const code = ts.transpileModule(picked, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
  return new Function(
    "MonthlyTimetable",
    "db",
    "rows",
    "row",
    "executeBatch",
    "id",
    "AccessError",
    "later",
    "number",
    code + `\nreturn {${names}};`,
  )(
    MonthlyTimetable,
    () => f.adapter,
    async (sql, values) =>
      (
        await f.adapter
          .prepare(sql)
          .bind(...values)
          .all()
      ).results,
    async (sql, values) =>
      f.adapter
        .prepare(sql)
        .bind(...values)
        .first(),
    async (queries) =>
      f.adapter.batch(
        queries.map((q) => f.adapter.prepare(q.sql).bind(...q.values)),
      ),
    () => crypto.randomUUID(),
    Error,
    (start, minutes) =>
      new Date(
        Date.parse(start.replace(" ", "T") + "+08:00") +
          minutes * 60000 +
          8 * 3600_000,
      )
        .toISOString()
        .slice(0, 16)
        .replace("T", " "),
    (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback),
  );
}
test("legacy create/edit/cancel/delete use the same safety boundary", async () => {
  const f = await setup();
  try {
    const api = legacy(f);
    await api.createSession(lesson);
    await assert.rejects(
      api.createSession({ ...lesson, sessionId: "legacy-b" }),
      /already reserved/,
    );
    await api.cancelSession({ sessionId: "lesson-a" });
    await assert.rejects(api.updateSession(lesson), /make-up lesson/);
    await api.deleteCourse({ courseId: "primary" });
    assert.equal(count(f, "class_sessions"), 0);
    for (const value of [
      "not-json",
      "{}",
      '[{"anchorDate":"2099-03-02","weekday":1,"startTime":"11:00","endTime":"09:00","teacherId":"teacher","classroomId":"room"}]',
    ])
      assert.throws(() => api.parsedWeeklySlots({ weeklySlots: value }));
    assert.throws(() => api.firstWeeklyDate("invalid", 1));
    assert.throws(() => api.firstWeeklyDate("2099-02-31", 1));
    assert.equal(api.firstWeeklyDate("2099-03-01", 1), "2099-03-02");
  } finally {
    f.close();
  }
});
test("legacy lesson order swaps roll back when a later statement fails", async () => {
  const f = await setup();
  try {
    await f.service.createSession(lesson);
    await f.service.createSession({
      ...lesson,
      sessionId: "lesson-b",
      startsAt: "2099-03-02 11:00",
      endsAt: "2099-03-02 12:00",
    });
    f.interrupt(2);
    await assert.rejects(
      legacy(f).swapSessionOrder({
        sessionId: "lesson-a",
        targetSessionId: "lesson-b",
      }),
      /Injected interruption/,
    );
    assert.deepEqual(
      f.db
        .prepare("SELECT session_no FROM class_sessions ORDER BY id")
        .all()
        .map((r) => r.session_no),
      [1, 2],
    );
  } finally {
    f.close();
  }
});

test("legacy quick scheduling rejects internal overlaps and preserves cancelled/completed history", async () => {
  const f = await setup();
  try {
    for (let n = 1; n <= 3; n++)
      f.insert("course_lesson_templates", {
        id: `template-${n}`,
        course_id: "primary",
        lesson_no: n,
        title: `Lesson ${n}`,
      });
    const api = legacy(f),
      slot = {
        anchorDate: "2099-03-02",
        weekday: 1,
        startTime: "09:00",
        endTime: "10:00",
        teacherId: "teacher",
        classroomId: "room",
      };
    await assert.rejects(
      api.configureClassRun({
        runId: "run-primary",
        weeklySlots: JSON.stringify([
          slot,
          { ...slot, startTime: "09:30", endTime: "10:30" },
        ]),
      }),
      /planned lessons overlap/,
    );
    assert.equal(count(f, "class_sessions"), 0);
    await api.configureClassRun({
      runId: "run-primary",
      weeklySlots: JSON.stringify([slot]),
    });
    assert.equal(count(f, "class_sessions"), 3);
    const first = f.db
      .prepare("SELECT id FROM class_sessions WHERE session_no=1")
      .get();
    await api.cancelSession({ sessionId: first.id });
    f.db.exec(
      "UPDATE class_sessions SET status='completed' WHERE session_no=2",
    );
    await api.configureClassRun({
      runId: "run-primary",
      weeklySlots: JSON.stringify([{ ...slot, anchorDate: "2099-04-06" }]),
    });
    assert.equal(count(f, "class_sessions"), 3);
    assert.equal(
      f.db.prepare("SELECT status FROM class_sessions WHERE session_no=1").get()
        .status,
      "cancelled",
    );
    assert.equal(
      f.db.prepare("SELECT status FROM class_sessions WHERE session_no=2").get()
        .status,
      "completed",
    );
  } finally {
    f.close();
  }
});

test("legacy curriculum sync rechecks new dates, never restores cancelled lessons and never adds student purchases", async () => {
  const f = await setup();
  try {
    const api = legacy(f);
    for (let n = 1; n <= 3; n++)
      f.insert("course_lesson_templates", {
        id: `template-${n}`,
        course_id: "primary",
        lesson_no: n,
        title: `Lesson ${n}`,
        default_duration_minutes: 60,
      });
    await f.service.createSession(lesson);
    book(f, "lesson-a");
    f.insert("class_sessions", {
      id: "busy",
      class_run_id: "run-secondary",
      session_no: 1,
      topic: "Busy",
      starts_at: "2099-03-16 09:00",
      ends_at: "2099-03-16 10:00",
    });
    f.insert("class_resource_bookings", {
      id: "busy-room",
      class_session_id: "busy",
      classroom_id: "room",
      starts_at: "2099-03-16 09:00",
      ends_at: "2099-03-16 10:00",
    });
    await assert.rejects(
      api.syncClassLessons({ runId: "run-primary" }),
      /already reserved/,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM class_sessions WHERE class_run_id='run-primary'",
        )
        .get().n,
      1,
    );
    f.db.exec(
      "UPDATE class_resource_bookings SET status='cancelled' WHERE id='busy-room'",
    );
    await api.syncClassLessons({ runId: "run-primary" });
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM class_sessions WHERE class_run_id='run-primary'",
        )
        .get().n,
      3,
    );
    assert.equal(count(f, "class_student_bookings"), 1);
    await api.cancelSession({ sessionId: "lesson-a" });
    await api.syncClassLessons({ runId: "run-primary" });
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM class_sessions WHERE class_run_id='run-primary'",
        )
        .get().n,
      3,
    );
  } finally {
    f.close();
  }
});
