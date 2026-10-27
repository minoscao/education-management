import type { Database } from "./learning-store";
import { validDate, type BusinessRow as Row } from "./business-workflow";
import { AccessError, digest } from "./portal-auth";
import {
  SchedulingService,
  malaysiaNow,
  type PlannedLesson,
  type ScheduleRun,
  type ScheduleQuery,
} from "./scheduling-service";
const val = (value: unknown) => String(value ?? "").trim();
const time = (value: unknown) => /^([01]\d|2[0-3]):[0-5]\d$/.test(val(value));
export type Occurrence = {
  key: string;
  slotId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  courseId: string;
  teacherId: string;
  languageId: string;
  roomId: string;
  capacity: number;
  delivery: string;
  label: string;
  conflict: string;
};
export function monthlyDates(month: string, repeats: number, weekday: number) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    !Number.isInteger(repeats) ||
    repeats < 1 ||
    repeats > 12 ||
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6
  )
    throw new AccessError("Choose a month, 1–12 months and a weekday.", 400);
  const [year, startMonth] = month.split("-").map(Number),
    dates: string[] = [];
  if (year < 2000 || year > 2100)
    throw new AccessError("Choose a year from 2000 to 2100.", 400);
  for (let offset = 0; offset < repeats; offset++) {
    const first = new Date(Date.UTC(year, startMonth - 1 + offset, 1));
    const end = new Date(Date.UTC(year, startMonth + offset, 0)).getUTCDate();
    for (let day = 1; day <= end; day++) {
      const d = new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day),
      );
      if (d.getUTCDay() === weekday) dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}
export class MonthlyTimetable extends SchedulingService {
  constructor(db: Database) {
    super(db);
  }
  async saveTeacher(input: Row) {
    const teacherId = val(input.teacherId),
      state = val(input.reviewStatus),
      years = Number(input.experienceYears || 0);
    if (!(await this.one("SELECT id FROM teachers WHERE id=?", [teacherId])))
      throw new AccessError("Choose an existing teacher.", 400);
    const courses = Array.isArray(input.allowedCourses)
      ? [...new Set(input.allowedCourses.map(String))]
      : [];
    const available = Array.isArray(input.availability)
      ? (input.availability as Row[])
      : [];
    if (
      !["candidate", "approved", "rejected"].includes(state) ||
      !Number.isInteger(years) ||
      years < 0 ||
      years > 80 ||
      available.length > 30
    )
      throw new AccessError("Review the teacher status and experience.", 400);
    const known = await this.all("SELECT id FROM course_catalogs");
    if (courses.some((id) => !known.some((c) => c.id === id)))
      throw new AccessError("Choose existing teaching courses.", 400);
    if (
      available.some(
        (a) =>
          !Number.isInteger(a.weekday) ||
          Number(a.weekday) < 0 ||
          Number(a.weekday) > 6 ||
          !time(a.start) ||
          !time(a.end) ||
          val(a.start) >= val(a.end),
      )
    )
      throw new AccessError(
        "Each availability period needs a weekday and a valid time range.",
        400,
      );
    if (
      state === "approved" &&
      (!val(input.qualifications) || !courses.length || !available.length)
    )
      throw new AccessError(
        "Approved teachers need qualifications, allowed courses and availability.",
        400,
      );
    if (
      input.dateOfBirth &&
      (!validDate(val(input.dateOfBirth)) ||
        val(input.dateOfBirth) > new Date().toISOString().slice(0, 10))
    )
      throw new AccessError("Choose a valid date of birth.", 400);
    await this.db
      .prepare(
        `INSERT INTO teacher_profiles(teacher_id,review_status,nickname,gender,date_of_birth,qualifications,university,experience_years,allowed_courses,availability,review_note) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(teacher_id) DO UPDATE SET review_status=excluded.review_status,nickname=excluded.nickname,gender=excluded.gender,date_of_birth=excluded.date_of_birth,qualifications=excluded.qualifications,university=excluded.university,experience_years=excluded.experience_years,allowed_courses=excluded.allowed_courses,availability=excluded.availability,review_note=excluded.review_note,updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(
        teacherId,
        state,
        val(input.nickname),
        val(input.gender),
        val(input.dateOfBirth),
        val(input.qualifications),
        val(input.university),
        years,
        JSON.stringify(courses),
        JSON.stringify(available),
        val(input.reviewNote),
      )
      .run();
  }
  async saveSlot(input: Row) {
    const roomId = val(input.classroomId),
      weekday = Number(input.weekday),
      start = val(input.startsTime),
      end = val(input.endsTime),
      kind = val(input.kind),
      slotId = val(input.slotId) || crypto.randomUUID();
    const room = await this.one(
      "SELECT r.* FROM classrooms r LEFT JOIN campuses c ON c.id=r.campus_id WHERE r.id=? AND r.status='active' AND (c.id IS NULL OR c.status='active')",
      [roomId],
    );
    if (
      !room ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6 ||
      !time(start) ||
      !time(end) ||
      start >= end ||
      !["lesson", "break", "special"].includes(kind)
    )
      throw new AccessError(
        "Choose a classroom, weekday and valid time slot.",
        400,
      );
    const overlap = await this.one(
      "SELECT id FROM classroom_time_slots WHERE classroom_id=? AND weekday=? AND active=1 AND starts_time<? AND ends_time>? AND id!=?",
      [roomId, weekday, end, start, slotId],
    );
    if (overlap)
      throw new AccessError(
        "This classroom template already contains an overlapping slot.",
        409,
      );
    const courseId = val(input.courseId),
      teacherId = val(input.teacherId),
      languageId = val(input.languageId),
      capacity = Number(
        input.capacity === undefined || input.capacity === ""
          ? room.capacity
          : input.capacity,
      ),
      delivery = val(input.deliveryMode) || "onsite";
    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > Number(room.capacity) ||
      !["onsite", "online"].includes(delivery)
    )
      throw new AccessError(
        "Capacity must fit the classroom. Choose a valid delivery mode.",
        400,
      );
    if (kind === "lesson") {
      if (
        !(await this.one(
          "SELECT id FROM course_catalogs WHERE id=? AND status='active'",
          [courseId],
        ))
      )
        throw new AccessError("Choose an active course.", 400);
      const reason = await this.teacherReason(
        teacherId,
        courseId,
        weekday,
        start,
        end,
        languageId,
      );
      if (reason) throw new AccessError(reason, 400);
    }
    await this.commit([
      {
        sql: "INSERT INTO scheduling_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM classrooms r LEFT JOIN campuses c ON c.id=r.campus_id WHERE r.id=? AND r.status='active' AND (c.id IS NULL OR c.status='active') AND r.capacity>=?) AND NOT EXISTS(SELECT 1 FROM classroom_time_slots WHERE classroom_id=? AND weekday=? AND active=1 AND starts_time<? AND ends_time>? AND id!=?) THEN 1 ELSE 0 END",
        values: [slotId, roomId, capacity, roomId, weekday, end, start, slotId],
      },
      {
        sql: "INSERT INTO classroom_time_slots(id,classroom_id,weekday,starts_time,ends_time,kind,course_id,teacher_id,language_id,label,capacity,delivery_mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET classroom_id=excluded.classroom_id,weekday=excluded.weekday,starts_time=excluded.starts_time,ends_time=excluded.ends_time,kind=excluded.kind,course_id=excluded.course_id,teacher_id=excluded.teacher_id,language_id=excluded.language_id,label=excluded.label,capacity=excluded.capacity,delivery_mode=excluded.delivery_mode,active=1,updated_at=CURRENT_TIMESTAMP",
        values: [
          slotId,
          roomId,
          weekday,
          start,
          end,
          kind,
          kind === "lesson" ? courseId : null,
          kind === "lesson" ? teacherId : null,
          kind === "lesson" ? languageId : null,
          val(input.label),
          capacity,
          delivery,
        ],
      },
      { sql: "DELETE FROM scheduling_guards WHERE id=?", values: [slotId] },
    ]);
  }
  async preview(input: Row) {
    const roomId = val(input.classroomId),
      month = val(input.month),
      repeats = Number(input.repeats);
    monthlyDates(month, repeats, 0);
    const [term, room, slots, teachers] = await Promise.all([
      this.one("SELECT * FROM academic_terms WHERE id=?", [val(input.termId)]),
      this.one(
        "SELECT r.*,c.status campus_status FROM classrooms r LEFT JOIN campuses c ON c.id=r.campus_id WHERE r.id=?",
        [roomId],
      ),
      this.all(
        "SELECT t.*,c.title,c.status course_status FROM classroom_time_slots t LEFT JOIN course_catalogs c ON c.id=t.course_id WHERE classroom_id=? AND active=1 ORDER BY weekday,starts_time",
        [roomId],
      ),
      this.all(
        "SELECT t.id,t.status,p.review_status,p.allowed_courses,p.availability,(SELECT json_group_array(language_id) FROM teacher_languages WHERE teacher_id=t.id) languages FROM teachers t LEFT JOIN teacher_profiles p ON p.teacher_id=t.id",
      ),
    ]);
    if (!term) throw new AccessError("Choose an academic term.", 400);
    if (
      !room ||
      room.status !== "active" ||
      (room.campus_status && room.campus_status !== "active")
    )
      throw new AccessError("Choose an active classroom and campus.", 400);
    const lessons = slots.filter((s) => s.kind === "lesson");
    if (!lessons.length)
      throw new AccessError(
        "Add a teaching slot to this classroom first.",
        400,
      );
    const dated = lessons.map((slot) => ({
      slot,
      dates: monthlyDates(month, repeats, Number(slot.weekday)),
    }));
    if (dated.reduce((n, s) => n + s.dates.length, 0) > 240)
      throw new AccessError(
        "This preview exceeds 240 lessons. Use fewer months per batch.",
        400,
      );
    const occurrences: Occurrence[] = [];
    for (const { slot, dates } of dated) {
      const teacherReason = this.teacherEligibility(
        teachers.find((t) => t.id === slot.teacher_id),
        val(slot.course_id),
        Number(slot.weekday),
        val(slot.starts_time),
        val(slot.ends_time),
        val(slot.language_id),
      );
      for (const date of dates) {
        const startsAt = `${date} ${slot.starts_time}`,
          endsAt = `${date} ${slot.ends_time}`;
        const conflict =
          teacherReason ||
          (slot.course_status !== "active"
            ? "Course is no longer active."
            : "") ||
          (Number(slot.capacity) > Number(room.capacity)
            ? "The classroom no longer has enough seats."
            : "") ||
          (date < val(term.starts_on) || date > val(term.ends_on)
            ? "Outside the selected academic term."
            : "") ||
          (startsAt <= malaysiaNow() ? "Lesson is in the past." : "");
        occurrences.push({
          key: `${slot.id}:${date}`,
          slotId: val(slot.id),
          date,
          startsAt,
          endsAt,
          courseId: val(slot.course_id),
          teacherId: val(slot.teacher_id),
          languageId: val(slot.language_id),
          roomId,
          capacity: Number(slot.capacity),
          delivery: val(slot.delivery_mode),
          label: val(slot.label) || val(slot.title),
          conflict,
        });
      }
    }
    const starts = occurrences.map((o) => o.startsAt).sort(),
      ends = occurrences.map((o) => o.endsAt).sort();
    const occupied = await this.all(
      "SELECT 'room' kind,classroom_id resource_id,starts_at,ends_at FROM class_resource_bookings WHERE classroom_id=? AND status!='cancelled' AND starts_at<? AND ends_at>? UNION ALL SELECT 'teacher',teacher_id,starts_at,ends_at FROM class_teacher_bookings WHERE teacher_id IN(SELECT value FROM json_each(?)) AND status!='cancelled' AND starts_at<? AND ends_at>? UNION ALL SELECT 'study',classroom_id,starts_at,ends_at FROM study_bookings WHERE classroom_id=? AND status IN ('booked','present') AND starts_at<? AND ends_at>?",
      [
        roomId,
        ends.at(-1),
        starts[0],
        JSON.stringify([...new Set(lessons.map((s) => s.teacher_id))]),
        ends.at(-1),
        starts[0],
        roomId,
        ends.at(-1),
        starts[0],
      ],
    );
    for (const a of occurrences) {
      const collision = occupied.find(
        (b) =>
          (b.kind !== "teacher" || b.resource_id === a.teacherId) &&
          val(b.starts_at) < a.endsAt &&
          val(b.ends_at) > a.startsAt,
      );
      if (collision)
        a.conflict ||=
          collision.kind === "teacher"
            ? "Teacher already assigned"
            : collision.kind === "study"
              ? "Classroom has a study visit"
              : "Classroom already reserved";
      if (
        occurrences.some(
          (b) =>
            a.key !== b.key &&
            a.teacherId === b.teacherId &&
            a.startsAt < b.endsAt &&
            a.endsAt > b.startsAt,
        )
      )
        a.conflict ||= "Teacher overlaps another slot in this preview.";
    }
    return {
      occurrences,
      signature: await digest(
        JSON.stringify({ slots, month, repeats, term, room }),
      ),
      month,
      repeats,
    };
  }
  async apply(input: Row) {
    await this.prepareAssignments();
    const key = val(input.requestKey);
    if (!/^[\w-]{8,100}$/.test(key))
      throw new AccessError("A valid request reference is required.", 400);
    if (
      await this.one("SELECT id FROM timetable_batches WHERE request_key=?", [
        key,
      ])
    )
      return;
    const preview = await this.preview(input);
    if (input.signature !== preview.signature)
      throw new AccessError(
        "The timetable template changed. Preview it again before creating lessons.",
        409,
      );
    const excluded = new Set(
      Array.isArray(input.excluded) ? input.excluded.map(String) : [],
    );
    const chosen = preview.occurrences.filter((o) => !excluded.has(o.key));
    if (!chosen.length)
      throw new AccessError("Select at least one lesson.", 400);
    if (chosen.some((o) => o.conflict))
      throw new AccessError(
        "Exclude or resolve the highlighted conflicts before creating lessons.",
        409,
      );
    const batchId = crypto.randomUUID(),
      queries: ScheduleQuery[] = [
        {
          sql: "INSERT INTO timetable_batches(id,request_key,classroom_id,starts_month,repeats) VALUES (?,?,?,?,?)",
          values: [
            batchId,
            key,
            input.classroomId,
            preview.month,
            preview.repeats,
          ],
        },
      ],
      plans: PlannedLesson[] = [],
      runs: ScheduleRun[] = [];
    for (const slotId of new Set(chosen.map((o) => o.slotId))) {
      const list = chosen
          .filter((o) => o.slotId === slotId)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        first = list[0],
        runId = crypto.randomUUID();
      runs.push({
        id: runId,
        course_id: first.courseId,
        term_id: val(input.termId),
        language_id: first.languageId,
        capacity: first.capacity,
        status: "draft",
      });
      queries.push(
        {
          sql: "INSERT INTO class_runs(id,code,course_id,term_id,name,capacity,price,status,enrollment_open_at,enrollment_close_at,language_id,teacher_id,delivery_mode) SELECT ?,?,id,?,?,?,list_price,'draft',?,?,?,?,? FROM course_catalogs WHERE id=?",
          values: [
            runId,
            `MONTH-${runId}`,
            input.termId,
            `${first.label} · ${preview.month}`,
            first.capacity,
            malaysiaNow().slice(0, 10),
            list.at(-1)!.date,
            first.languageId,
            first.teacherId,
            first.delivery,
            first.courseId,
          ],
        },
        {
          sql: "INSERT INTO timetable_batch_runs(batch_id,run_id) VALUES (?,?)",
          values: [batchId, runId],
        },
      );
      for (const [index, o] of list.entries())
        plans.push({
          id: crypto.randomUUID(),
          runId,
          sessionNo: index + 1,
          topic: `${o.label} · lesson ${index + 1}`,
          startsAt: o.startsAt,
          endsAt: o.endsAt,
          classroomId: o.roomId,
          teacherId: o.teacherId,
        });
    }
    queries.push(...(await this.preparePlan(plans, runs)));
    await this.commit(queries);
  }
  async publish(input: Row) {
    await this.prepareAssignments();
    const runId = val(input.runId),
      run = await this.one("SELECT * FROM class_runs WHERE id=?", [runId]);
    if (!run || !["draft", "open"].includes(val(run.status)))
      throw new AccessError("Choose an unpublished or open class.", 400);
    const sessions = await this.all(
      "SELECT s.*,r.classroom_id,t.teacher_id FROM class_sessions s LEFT JOIN class_resource_bookings r ON r.class_session_id=s.id AND r.status!='cancelled' LEFT JOIN class_teacher_bookings t ON t.class_session_id=s.id AND t.status!='cancelled' WHERE s.class_run_id=? AND s.status NOT IN ('cancelled','completed') AND s.starts_at>?",
      [runId, malaysiaNow()],
    );
    if (!sessions.length)
      throw new AccessError(
        "Create future lessons before publishing this class.",
        400,
      );
    if (
      run.status === "draft" &&
      (await this.one(
        "SELECT id FROM class_sessions WHERE class_run_id=? AND status NOT IN ('cancelled','completed') AND starts_at<=?",
        [runId, malaysiaNow()],
      ))
    )
      throw new AccessError(
        "Review past lessons before publishing this draft.",
        400,
      );
    const plans = sessions.map((s) => ({
      id: val(s.id),
      runId,
      topic: val(s.topic),
      startsAt: val(s.starts_at),
      endsAt: val(s.ends_at),
      classroomId: val(s.classroom_id),
      teacherId: val(s.teacher_id),
    }));
    const checks = (await this.preparePlan(plans)).filter(
      (q) =>
        q.sql.startsWith("INSERT INTO scheduling_guards") ||
        q.sql.startsWith("DELETE FROM scheduling_guards"),
    );
    await this.commit([
      ...checks,
      {
        sql: "UPDATE class_runs SET status='open' WHERE id=?",
        values: [runId],
      },
    ]);
  }
  async timetableSnapshot() {
    return {
      slots: await this.all(
        "SELECT * FROM classroom_time_slots WHERE active=1 ORDER BY classroom_id,weekday,starts_time",
      ),
      teacherProfiles: await this.all("SELECT * FROM teacher_profiles"),
    };
  }
}
