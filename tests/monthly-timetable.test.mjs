import assert from "node:assert/strict";
import test from "node:test";
import { fixture, load } from "./workflow-fixture.mjs";
const { MonthlyTimetable, monthlyDates } = await load("monthly-timetable");
async function setup() {
  const f = fixture(),
    service = new MonthlyTimetable(f.adapter);
  await service.saveTeacher({
    teacherId: "teacher",
    reviewStatus: "approved",
    qualifications: "Teaching degree",
    allowedCourses: ["primary"],
    availability: [{ weekday: 1, start: "08:00", end: "18:00" }],
  });
  await service.saveSlot({
    classroomId: "room",
    weekday: 1,
    startsTime: "09:00",
    endsTime: "10:00",
    kind: "lesson",
    courseId: "primary",
    teacherId: "teacher",
    languageId: "language",
    capacity: 12,
  });
  return { ...f, service };
}
const request = {
  classroomId: "room",
  month: "2099-03",
  repeats: 2,
  termId: "term",
  requestKey: "month-batch-test",
};
test("monthly repetition uses real calendar dates, fifth weeks, leap day and year boundaries", () => {
  assert.ok(
    monthlyDates("2028-02", 1, 2).every((d) => d.startsWith("2028-02")),
  );
  assert.ok(monthlyDates("2028-02", 1, 2).includes("2028-02-29"));
  assert.equal(monthlyDates("2026-03", 1, 2).length, 5);
  assert.ok(monthlyDates("2099-12", 2, 1).some((d) => d.startsWith("2100-01")));
  assert.throws(() => monthlyDates("2026-13", 1, 1));
  assert.throws(() => monthlyDates("2026-01", 0, 1));
});
test("monthly generation requires preview, supports date exclusions and remains draft until published", async () => {
  const f = await setup();
  try {
    const preview = await f.service.preview(request);
    assert.ok(preview.occurrences.length > 7);
    assert.equal(
      preview.occurrences.some((o) => o.conflict),
      false,
    );
    await assert.rejects(
      f.service.apply({ ...request, signature: "stale" }),
      /Preview|preview/,
    );
    const excluded = [preview.occurrences[0].key];
    await f.service.apply({
      ...request,
      signature: preview.signature,
      excluded,
    });
    await f.service.apply({
      ...request,
      signature: preview.signature,
      excluded,
    });
    const run = f.db
      .prepare("SELECT * FROM class_runs WHERE status='draft'")
      .get();
    assert.ok(run);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM class_sessions").get().n,
      preview.occurrences.length - 1,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM timetable_batches").get().n,
      1,
    );
    await f.service.publish({ runId: run.id });
    assert.equal(
      f.db.prepare("SELECT status FROM class_runs WHERE id=?").get(run.id)
        .status,
      "open",
    );
  } finally {
    f.close();
  }
});
test("classroom templates reject overlap, invalid capacity and unapproved teacher scopes", async () => {
  const f = await setup();
  try {
    const slot = {
      classroomId: "room",
      weekday: 1,
      startsTime: "09:30",
      endsTime: "10:30",
      kind: "break",
      capacity: 12,
    };
    await assert.rejects(f.service.saveSlot(slot), /overlapping/);
    await assert.rejects(
      f.service.saveSlot({
        ...slot,
        startsTime: "11:00",
        endsTime: "12:00",
        capacity: 17,
      }),
      /Capacity/,
    );
    await assert.rejects(
      f.service.saveSlot({
        ...slot,
        startsTime: "11:00",
        endsTime: "12:00",
        kind: "lesson",
        courseId: "secondary",
        teacherId: "teacher",
        languageId: "language",
      }),
      /not approved for this course/,
    );
    await assert.rejects(
      f.service.saveSlot({
        ...slot,
        startsTime: "19:00",
        endsTime: "20:00",
        kind: "lesson",
        courseId: "primary",
        teacherId: "teacher",
        languageId: "language",
      }),
      /availability/,
    );
  } finally {
    f.close();
  }
});
test("batch transaction checks resource conflicts again and rolls back the complete timetable", async () => {
  const f = await setup();
  try {
    const preview = await f.service.preview(request),
      o = preview.occurrences[1];
    f.beforeBatch(() => {
      f.insert("class_sessions", {
        id: "concurrent",
        class_run_id: "run-primary",
        starts_at: o.startsAt,
        ends_at: o.endsAt,
      });
      f.insert("class_resource_bookings", {
        id: "concurrent-room",
        class_session_id: "concurrent",
        classroom_id: "room",
        starts_at: o.startsAt,
        ends_at: o.endsAt,
      });
    });
    await assert.rejects(
      f.service.apply({ ...request, signature: preview.signature }),
      /schedule or its resources changed/,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM timetable_batches").get().n,
      0,
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM class_runs WHERE status='draft'")
        .get().n,
      0,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM class_sessions").get().n,
      1,
    );
  } finally {
    f.close();
  }
});
test("template edits invalidate previews; rejected teacher approval prevents publication", async () => {
  const f = await setup();
  try {
    const preview = await f.service.preview(request);
    f.db.exec("UPDATE classroom_time_slots SET label='Changed'");
    await assert.rejects(
      f.service.apply({ ...request, signature: preview.signature }),
      /template changed/,
    );
    const next = await f.service.preview(request);
    await f.service.apply({ ...request, signature: next.signature });
    const run = f.db
      .prepare("SELECT id FROM class_runs WHERE status='draft'")
      .get();
    f.db.exec("UPDATE teacher_profiles SET review_status='rejected'");
    await assert.rejects(
      f.service.publish({ runId: run.id }),
      /qualifications/,
    );
    assert.equal(
      f.db.prepare("SELECT status FROM class_runs WHERE id=?").get(run.id)
        .status,
      "draft",
    );
  } finally {
    f.close();
  }
});
