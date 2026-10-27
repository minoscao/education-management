import type { Database } from "./learning-store";
import {
  BusinessWorkflow,
  validDate,
  type BusinessRow as Row,
} from "./business-workflow";
import { AccessError, type PortalActor } from "./portal-auth";
import { ensureSchedulingSchema } from "./scheduling-schema";

export type ScheduleQuery = { sql: string; values: unknown[] };
export type PlannedLesson = {
  id: string;
  runId: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  classroomId: string;
  teacherId: string;
  sessionNo?: number;
  onlineUrl?: string;
  payAmount?: number;
};
export type ScheduleRun = {
  id: string;
  course_id: string;
  term_id: string;
  language_id: string;
  capacity: number;
  status: string;
};
const text = (v: unknown) => String(v ?? "").trim();
const stamp = (v: unknown) => text(v).replace("T", " ").slice(0, 16);
const jsonList = (v: unknown): Row[] => {
  try {
    const a = JSON.parse(text(v) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};
export const malaysiaNow = () =>
  new Date(Date.now() + 8 * 3600_000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
export function validLessonTime(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(value) &&
    validDate(value.slice(0, 10))
  );
}
export const overlapsLesson = (
  a: { startsAt: string; endsAt: string },
  b: { startsAt: string; endsAt: string },
) => a.startsAt < b.endsAt && a.endsAt > b.startsAt;
export function laterMalaysia(start: string, minutes: number) {
  const d = new Date(start.replace(" ", "T") + "+08:00");
  if (!Number.isFinite(d.getTime()) || !Number.isFinite(minutes))
    throw new AccessError("Choose a valid lesson time.", 400);
  return new Date(d.getTime() + minutes * 60_000 + 8 * 3600_000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

/** One write boundary shared by manual, monthly and make-up scheduling. */
export class SchedulingService extends BusinessWorkflow {
  constructor(db: Database) {
    super(db);
  }
  async prepareAssignments() {
    await ensureSchedulingSchema(this.db);
  }
  teacherEligibility(
    profile: Row | undefined,
    courseId: string,
    weekday: number,
    start: string,
    end: string,
    languageId: string,
  ) {
    if (
      !profile ||
      profile.review_status !== "approved" ||
      ["inactive", "unavailable"].includes(text(profile.status))
    )
      return "Teacher qualifications must be approved.";
    if (
      !(jsonList(profile.allowed_courses) as unknown as string[]).includes(
        courseId,
      )
    )
      return "Teacher is not approved for this course.";
    if (
      !jsonList(profile.availability).some(
        (a) =>
          Number(a.weekday) === weekday &&
          text(a.start) <= start &&
          text(a.end) >= end,
      )
    )
      return "Outside the teacher’s approved availability.";
    if (
      !(jsonList(profile.languages) as unknown as string[]).includes(languageId)
    )
      return "Teacher is not approved for this teaching language.";
    return "";
  }
  async teacherReason(
    teacherId: string,
    courseId: string,
    weekday: number,
    start: string,
    end: string,
    languageId: string,
  ) {
    const profile = await this.one(
      "SELECT p.*,t.status,(SELECT json_group_array(language_id) FROM teacher_languages WHERE teacher_id=t.id) languages FROM teachers t LEFT JOIN teacher_profiles p ON p.teacher_id=t.id WHERE t.id=?",
      [teacherId],
    );
    return this.teacherEligibility(
      profile || undefined,
      courseId,
      weekday,
      start,
      end,
      languageId,
    );
  }
  async prepareCreateSession(
    input: Row,
    actor?: PortalActor,
  ): Promise<{ sessionId: string; queries: ScheduleQuery[] }> {
    if (actor && actor.role !== "admin")
      throw new AccessError(
        "Administrator access is required to schedule lessons.",
        403,
      );
    await this.prepareAssignments();
    const run = await this.one(
      "SELECT r.*,c.default_minutes FROM class_runs r JOIN course_catalogs c ON c.id=r.course_id WHERE r.id=?",
      [text(input.runId)],
    );
    if (!run) throw new AccessError("Class not found.", 404);
    const sessionId = text(input.sessionId) || `session-${crypto.randomUUID()}`;
    const start = stamp(input.startsAt),
      end = input.endsAt
        ? stamp(input.endsAt)
        : laterMalaysia(start, Number(run.default_minutes) || 90);
    const queries = await this.preparePlan([
      {
        id: sessionId,
        runId: text(input.runId),
        topic: text(input.topic) || "Lesson",
        startsAt: start,
        endsAt: end,
        classroomId: text(input.classroomId),
        teacherId: text(input.teacherId),
        onlineUrl:
          input.onlineUrl === undefined ? undefined : text(input.onlineUrl),
        payAmount:
          input.payAmount === undefined ? undefined : Number(input.payAmount),
      },
    ]);
    return { sessionId, queries };
  }
  async createSession(input: Row) {
    const prepared = await this.prepareCreateSession(input);
    await this.commit(prepared.queries);
    return { sessionId: prepared.sessionId };
  }
  async updateSession(input: Row) {
    const current = await this.one("SELECT * FROM class_sessions WHERE id=?", [
      text(input.sessionId),
    ]);
    if (!current) throw new AccessError("Lesson not found.", 404);
    await this.applyPlan([
      {
        id: text(current.id),
        runId: text(current.class_run_id),
        topic: text(input.topic) || text(current.topic),
        startsAt: stamp(input.startsAt),
        endsAt: stamp(input.endsAt),
        classroomId: text(input.classroomId),
        teacherId: text(input.teacherId),
        onlineUrl:
          input.onlineUrl === undefined ? undefined : text(input.onlineUrl),
      },
    ]);
  }
  async commit(queries: ScheduleQuery[]) {
    try {
      await this.batch(queries);
    } catch (error) {
      if (
        /CHECK constraint failed.*valid|scheduling_guards/i.test(String(error))
      )
        throw new AccessError(
          "The schedule or its resources changed. Refresh and review teacher approval, room capacity and conflicts before trying again.",
          409,
        );
      throw error;
    }
  }
  async applyPlan(plans: PlannedLesson[]) {
    const queries = await this.preparePlan(plans);
    await this.commit(queries);
  }
  async preparePlan(
    plans: PlannedLesson[],
    newRuns: ScheduleRun[] = [],
  ): Promise<ScheduleQuery[]> {
    await this.prepareAssignments();
    if (!plans.length || plans.length > 240)
      throw new AccessError("Choose 1–240 lessons per update.", 400);
    const ids = plans.map((p) => p.id),
      runIds = [...new Set(plans.map((p) => p.runId))];
    if (new Set(ids).size !== ids.length)
      throw new AccessError("A lesson appears twice in this update.", 400);
    const [
      storedRuns,
      courses,
      terms,
      rooms,
      teachers,
      originals,
      resources,
      teaching,
      studentBookings,
    ] = await Promise.all([
      this.all(
        "SELECT * FROM class_runs WHERE id IN (SELECT value FROM json_each(?))",
        [JSON.stringify(runIds)],
      ),
      this.all("SELECT id,status FROM course_catalogs"),
      this.all("SELECT * FROM academic_terms"),
      this.all(
        "SELECT r.*,c.status campus_status FROM classrooms r LEFT JOIN campuses c ON c.id=r.campus_id",
      ),
      this.all(
        "SELECT t.id,t.status,p.review_status,p.allowed_courses,p.availability,(SELECT json_group_array(language_id) FROM teacher_languages WHERE teacher_id=t.id) languages FROM teachers t LEFT JOIN teacher_profiles p ON p.teacher_id=t.id",
      ),
      this.all(
        "SELECT * FROM class_sessions WHERE id IN (SELECT value FROM json_each(?))",
        [JSON.stringify(ids)],
      ),
      this.all(
        "SELECT * FROM class_resource_bookings WHERE class_session_id IN (SELECT value FROM json_each(?))",
        [JSON.stringify(ids)],
      ),
      this.all(
        "SELECT * FROM class_teacher_bookings WHERE class_session_id IN (SELECT value FROM json_each(?))",
        [JSON.stringify(ids)],
      ),
      this.all(
        "SELECT class_session_id,student_id FROM class_student_bookings WHERE class_session_id IN (SELECT value FROM json_each(?)) AND status='booked'",
        [JSON.stringify(ids)],
      ),
    ]);
    const runs = [...storedRuns, ...newRuns];
    for (const p of plans) {
      if (
        !validLessonTime(p.startsAt) ||
        !validLessonTime(p.endsAt) ||
        p.startsAt >= p.endsAt ||
        p.startsAt.slice(0, 10) !== p.endsAt.slice(0, 10) ||
        p.startsAt <= malaysiaNow()
      )
        throw new AccessError(
          "Choose a future lesson with valid start and end times on the same day.",
          400,
        );
      if (p.onlineUrl && !/^https:\/\//i.test(p.onlineUrl))
        throw new AccessError("Use a secure https classroom link.", 400);
      if (
        p.payAmount !== undefined &&
        (!Number.isFinite(p.payAmount) || p.payAmount < 0)
      )
        throw new AccessError("Enter a valid teaching payment amount.", 400);
      const old = originals.find((s) => s.id === p.id);
      if (
        old &&
        (old.class_run_id !== p.runId ||
          ["cancelled", "completed"].includes(text(old.status)))
      )
        throw new AccessError(
          "Cancelled or completed lessons cannot be reopened by editing. Arrange a make-up lesson instead.",
          409,
        );
      const run = runs.find((r) => r.id === p.runId),
        room = rooms.find((r) => r.id === p.classroomId),
        term = terms.find((t) => t.id === run?.term_id);
      if (
        !run ||
        !["draft", "open"].includes(text(run.status)) ||
        !courses.some((c) => c.id === run.course_id && c.status === "active")
      )
        throw new AccessError(
          "Choose an active course and a draft or published class.",
          400,
        );
      if (
        !term ||
        p.startsAt.slice(0, 10) < text(term.starts_on) ||
        p.endsAt.slice(0, 10) > text(term.ends_on)
      )
        throw new AccessError(
          "The lesson must fall within the class academic term.",
          400,
        );
      if (
        !room ||
        room.status !== "active" ||
        (room.campus_status && room.campus_status !== "active") ||
        Number(room.capacity) < Number(run.capacity)
      )
        throw new AccessError(
          "Choose an active classroom with enough seats for this class.",
          400,
        );
      const reason = this.teacherEligibility(
        teachers.find((t) => t.id === p.teacherId),
        text(run.course_id),
        new Date(p.startsAt.slice(0, 10) + "T12:00:00Z").getUTCDay(),
        p.startsAt.slice(11),
        p.endsAt.slice(11),
        text(run.language_id),
      );
      if (reason) throw new AccessError(reason, 400);
      if (
        resources.filter((r) => r.class_session_id === p.id).length > 1 ||
        teaching.filter((t) => t.class_session_id === p.id).length > 1
      )
        throw new AccessError(
          "This lesson has duplicate resource records. Review them before rescheduling.",
          409,
        );
      const paid = teaching.find(
        (t) => t.class_session_id === p.id && t.pay_status === "paid",
      );
      if (
        paid &&
        (paid.teacher_id !== p.teacherId ||
          (p.payAmount !== undefined &&
            Number(paid.pay_amount) !== p.payAmount))
      )
        throw new AccessError(
          "Review the settled teacher payment before changing its teacher or amount.",
          409,
        );
    }
    for (const [i, a] of plans.entries())
      for (const b of plans.slice(i + 1)) {
        if (!overlapsLesson(a, b)) continue;
        if (a.classroomId === b.classroomId || a.teacherId === b.teacherId)
          throw new AccessError(
            "The planned lessons overlap for a teacher or classroom.",
            409,
          );
        const learners = new Set(
          studentBookings
            .filter((x) => x.class_session_id === a.id)
            .map((x) => x.student_id),
        );
        if (
          studentBookings.some(
            (x) => x.class_session_id === b.id && learners.has(x.student_id),
          )
        )
          throw new AccessError(
            "A student would have two lessons at the same time.",
            409,
          );
      }
    const start = plans.map((p) => p.startsAt).sort()[0],
      end = plans
        .map((p) => p.endsAt)
        .sort()
        .at(-1)!;
    const occupied = await this.all(
      "SELECT 'room' kind,classroom_id resource_id,class_session_id,starts_at,ends_at FROM class_resource_bookings WHERE status!='cancelled' AND starts_at<? AND ends_at>? AND class_session_id NOT IN (SELECT value FROM json_each(?)) UNION ALL SELECT 'teacher',teacher_id,class_session_id,starts_at,ends_at FROM class_teacher_bookings WHERE status!='cancelled' AND starts_at<? AND ends_at>? AND class_session_id NOT IN (SELECT value FROM json_each(?)) UNION ALL SELECT 'room',classroom_id,'',starts_at,ends_at FROM study_bookings WHERE status IN ('booked','present') AND starts_at<? AND ends_at>?",
      [
        end,
        start,
        JSON.stringify(ids),
        end,
        start,
        JSON.stringify(ids),
        end,
        start,
      ],
    );
    for (const p of plans)
      if (
        occupied.some(
          (o) =>
            (o.kind === "room"
              ? o.resource_id === p.classroomId
              : o.resource_id === p.teacherId) &&
            text(o.starts_at) < p.endsAt &&
            text(o.ends_at) > p.startsAt,
        )
      )
        throw new AccessError(
          "A classroom or teacher is already reserved, including study visits.",
          409,
        );
    const queries: ScheduleQuery[] = [];
    for (const p of plans) {
      const old = originals.find((s) => s.id === p.id),
        run = runs.find((r) => r.id === p.runId)!;
      queries.push(this.guard(p, ids, old, run));
      if (old)
        queries.push(
          {
            sql: "INSERT INTO scheduling_guards(id,valid) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM class_student_bookings a JOIN class_student_bookings b ON b.student_id=a.student_id JOIN json_each(?) j ON json_extract(j.value,'$.id')=b.class_session_id WHERE a.class_session_id=? AND a.status='booked' AND b.status='booked' AND b.class_session_id!=a.class_session_id AND json_extract(j.value,'$.startsAt')<? AND json_extract(j.value,'$.endsAt')>?) THEN 1 ELSE 0 END",
            values: [
              `${p.id}:learners`,
              JSON.stringify(
                plans.map((s) => ({
                  id: s.id,
                  startsAt: s.startsAt,
                  endsAt: s.endsAt,
                })),
              ),
              p.id,
              p.endsAt,
              p.startsAt,
            ],
          },
          {
            sql: "DELETE FROM scheduling_guards WHERE id=?",
            values: [`${p.id}:learners`],
          },
        );
      if (old)
        queries.push({
          sql: "UPDATE class_sessions SET topic=?,starts_at=?,ends_at=?,online_url=COALESCE(?,online_url) WHERE id=?",
          values: [p.topic, p.startsAt, p.endsAt, p.onlineUrl ?? null, p.id],
        });
      else
        queries.push({
          sql: "INSERT INTO class_sessions(id,class_run_id,session_no,topic,starts_at,ends_at,status,online_url) VALUES(?,?,COALESCE(?,(SELECT COALESCE(MAX(session_no),0)+1 FROM class_sessions WHERE class_run_id=?)),?,?,?,'scheduled',?)",
          values: [
            p.id,
            p.runId,
            p.sessionNo ?? null,
            p.runId,
            p.topic,
            p.startsAt,
            p.endsAt,
            p.onlineUrl || "",
          ],
        });
      const room = resources.find((r) => r.class_session_id === p.id),
        teacher = teaching.find((t) => t.class_session_id === p.id);
      queries.push(
        room
          ? {
              sql: "UPDATE class_resource_bookings SET classroom_id=?,starts_at=?,ends_at=?,status='reserved' WHERE id=?",
              values: [p.classroomId, p.startsAt, p.endsAt, room.id],
            }
          : {
              sql: "INSERT INTO class_resource_bookings(id,class_session_id,classroom_id,starts_at,ends_at,status) VALUES(?,?,?,?,?,'reserved')",
              values: [
                `${p.id}:room`,
                p.id,
                p.classroomId,
                p.startsAt,
                p.endsAt,
              ],
            },
      );
      queries.push(
        teacher
          ? {
              sql: "UPDATE class_teacher_bookings SET teacher_id=?,starts_at=?,ends_at=?,pay_amount=COALESCE(?,pay_amount),status='confirmed' WHERE id=?",
              values: [
                p.teacherId,
                p.startsAt,
                p.endsAt,
                p.payAmount ?? null,
                teacher.id,
              ],
            }
          : {
              sql: "INSERT INTO class_teacher_bookings(id,class_session_id,teacher_id,starts_at,ends_at,pay_amount,pay_status,status) VALUES(?,?,?,?,?,?,'unpaid','confirmed')",
              values: [
                `${p.id}:teacher`,
                p.id,
                p.teacherId,
                p.startsAt,
                p.endsAt,
                p.payAmount ?? 0,
              ],
            },
      );
      if (old)
        queries.push(
          {
            sql: "INSERT INTO portal_notifications(id,recipient_type,recipient_id,title,body) SELECT ?||student_id,'student',student_id,'Lesson updated',? FROM class_student_bookings WHERE class_session_id=? AND status='booked'",
            values: [
              `${crypto.randomUUID()}:`,
              `${p.topic} is scheduled for ${p.startsAt}–${p.endsAt.slice(11)}. Review your timetable for the classroom and teacher.`,
              p.id,
            ],
          },
          {
            sql: "INSERT INTO portal_notifications(id,recipient_type,recipient_id,title,body) VALUES(?,'teacher',?,'Lesson updated',?)",
            values: [
              crypto.randomUUID(),
              p.teacherId,
              `${p.topic}: ${p.startsAt}–${p.endsAt.slice(11)}.`,
            ],
          },
        );
      queries.push(
        {
          sql: "INSERT INTO class_session_changes(id,class_session_id,change_type,original_session_no,original_topic,original_starts_at,original_ends_at,new_session_no,new_topic,new_starts_at,new_ends_at) VALUES(?,?,?,?,?,?,?,(SELECT session_no FROM class_sessions WHERE id=?),?,?,?)",
          values: [
            crypto.randomUUID(),
            p.id,
            old ? "changed" : "created",
            old?.session_no ?? null,
            old?.topic ?? null,
            old?.starts_at ?? null,
            old?.ends_at ?? null,
            p.id,
            p.topic,
            p.startsAt,
            p.endsAt,
          ],
        },
        { sql: "DELETE FROM scheduling_guards WHERE id=?", values: [p.id] },
      );
    }
    return queries;
  }
  guard(
    p: PlannedLesson,
    plannedIds: string[],
    old: Row | undefined,
    run: Row | ScheduleRun,
  ): ScheduleQuery {
    const weekday = new Date(
      p.startsAt.slice(0, 10) + "T12:00:00Z",
    ).getUTCDay();
    return {
      sql: `INSERT INTO scheduling_guards(id,valid) SELECT ?,CASE WHEN
      EXISTS(SELECT 1 FROM class_runs r JOIN course_catalogs c ON c.id=r.course_id JOIN academic_terms a ON a.id=r.term_id WHERE r.id=? AND r.status IN ('draft','open') AND c.status='active' AND r.course_id=? AND COALESCE(r.language_id,'')=? AND r.capacity=? AND a.starts_on<=substr(?,1,10) AND a.ends_on>=substr(?,1,10))
      AND EXISTS(SELECT 1 FROM classrooms r LEFT JOIN campuses c ON c.id=r.campus_id WHERE r.id=? AND r.status='active' AND (c.id IS NULL OR c.status='active') AND r.capacity>=?)
      AND EXISTS(SELECT 1 FROM teachers t JOIN teacher_profiles p ON p.teacher_id=t.id WHERE t.id=? AND t.status NOT IN ('inactive','unavailable') AND p.review_status='approved' AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(p.allowed_courses) THEN p.allowed_courses ELSE '[]' END) WHERE value=?) AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(p.availability) THEN p.availability ELSE '[]' END) WHERE json_extract(value,'$.weekday')=? AND json_extract(value,'$.start')<=? AND json_extract(value,'$.end')>=?) AND EXISTS(SELECT 1 FROM teacher_languages WHERE teacher_id=t.id AND language_id=?))
      AND NOT EXISTS(SELECT 1 FROM class_resource_bookings WHERE classroom_id=? AND status!='cancelled' AND starts_at<? AND ends_at>? AND class_session_id NOT IN(SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM class_teacher_bookings WHERE teacher_id=? AND status!='cancelled' AND starts_at<? AND ends_at>? AND class_session_id NOT IN(SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM study_bookings WHERE classroom_id=? AND status IN ('booked','present') AND starts_at<? AND ends_at>?)
      AND NOT EXISTS(SELECT 1 FROM class_student_bookings mine JOIN class_student_bookings other ON other.student_id=mine.student_id JOIN class_sessions s ON s.id=other.class_session_id WHERE mine.class_session_id=? AND mine.status='booked' AND other.status='booked' AND s.status!='cancelled' AND s.id NOT IN(SELECT value FROM json_each(?)) AND s.starts_at<? AND s.ends_at>?)
      AND NOT EXISTS(SELECT 1 FROM class_student_bookings b JOIN study_bookings s ON s.student_id=b.student_id WHERE b.class_session_id=? AND b.status='booked' AND s.status IN ('booked','present') AND s.starts_at<? AND s.ends_at>?)
      AND NOT EXISTS(SELECT 1 FROM learning_credit_events e JOIN class_student_bookings b ON b.id=e.booking_id JOIN student_passes t ON t.id=e.pass_id WHERE b.class_session_id=? AND b.status='booked' AND e.status='reserved' AND (t.status!='active' OR t.valid_from>substr(?,1,10) OR t.valid_until<substr(?,1,10)))
      AND (SELECT COUNT(*) FROM class_resource_bookings WHERE class_session_id=?)<=1
      AND (SELECT COUNT(*) FROM class_teacher_bookings WHERE class_session_id=?)<=1
      AND NOT EXISTS(SELECT 1 FROM class_teacher_bookings WHERE class_session_id=? AND pay_status='paid' AND (teacher_id!=? OR (? IS NOT NULL AND pay_amount!=?)))
      AND ${old ? "EXISTS(SELECT 1 FROM class_sessions WHERE id=? AND starts_at=? AND ends_at=? AND status=?)" : "NOT EXISTS(SELECT 1 FROM class_sessions WHERE id=?)"} THEN 1 ELSE 0 END`,
      values: [
        p.id,
        p.runId,
        run.course_id,
        text(run.language_id),
        run.capacity,
        p.startsAt,
        p.endsAt,
        p.classroomId,
        run.capacity,
        p.teacherId,
        run.course_id,
        weekday,
        p.startsAt.slice(11),
        p.endsAt.slice(11),
        text(run.language_id),
        p.classroomId,
        p.endsAt,
        p.startsAt,
        JSON.stringify(plannedIds),
        p.teacherId,
        p.endsAt,
        p.startsAt,
        JSON.stringify(plannedIds),
        p.classroomId,
        p.endsAt,
        p.startsAt,
        p.id,
        JSON.stringify(plannedIds),
        p.endsAt,
        p.startsAt,
        p.id,
        p.endsAt,
        p.startsAt,
        p.id,
        p.startsAt,
        p.endsAt,
        p.id,
        p.id,
        p.id,
        p.teacherId,
        p.payAmount ?? null,
        p.payAmount ?? null,
        ...(old ? [p.id, old.starts_at, old.ends_at, old.status] : [p.id]),
      ],
    };
  }
  async cancelSession(input: Row) {
    const current = await this.one("SELECT * FROM class_sessions WHERE id=?", [
      text(input.sessionId),
    ]);
    if (!current) throw new AccessError("Lesson not found.", 404);
    if (current.status === "cancelled") return;
    if (current.status === "completed")
      throw new AccessError("A completed lesson cannot be cancelled.", 409);
    await this.commit([
      {
        sql: "INSERT INTO scheduling_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM class_sessions WHERE id=? AND status=? AND starts_at=? AND ends_at=?) THEN 1 ELSE 0 END",
        values: [
          text(current.id),
          current.id,
          current.status,
          current.starts_at,
          current.ends_at,
        ],
      },
      {
        sql: "INSERT INTO portal_notifications(id,recipient_type,recipient_id,title,body) SELECT ?||student_id,'student',student_id,'Lesson cancelled',? FROM class_student_bookings WHERE class_session_id=? AND status='booked'",
        values: [
          `${crypto.randomUUID()}:`,
          `${current.topic} on ${current.starts_at} has been cancelled by the campus. Reserved tickets have been released; contact the campus about a make-up lesson.`,
          current.id,
        ],
      },
      {
        sql: "UPDATE class_sessions SET status='cancelled' WHERE id=?",
        values: [current.id],
      },
      {
        sql: "UPDATE class_resource_bookings SET status='cancelled' WHERE class_session_id=?",
        values: [current.id],
      },
      {
        sql: "UPDATE class_teacher_bookings SET status='cancelled' WHERE class_session_id=?",
        values: [current.id],
      },
      {
        sql: "INSERT INTO class_session_changes(id,class_session_id,change_type,original_session_no,original_topic,original_starts_at,original_ends_at) VALUES(?,?,'cancelled',?,?,?,?)",
        values: [
          crypto.randomUUID(),
          current.id,
          current.session_no,
          current.topic,
          current.starts_at,
          current.ends_at,
        ],
      },
      { sql: "DELETE FROM scheduling_guards WHERE id=?", values: [current.id] },
    ]);
  }
  async deleteCourse(input: Row) {
    const courseId = text(input.courseId);
    if (!courseId) throw new AccessError("Choose a course.", 400);
    const activity = await this.one(
      "SELECT e.id FROM class_enrollments e JOIN class_runs r ON r.id=e.class_run_id WHERE r.course_id=? LIMIT 1",
      [courseId],
    );
    if (activity)
      throw new AccessError(
        "This course has student records. Keep it for history and mark it inactive instead.",
        409,
      );
    const sessions =
      "SELECT s.id FROM class_sessions s JOIN class_runs r ON r.id=s.class_run_id WHERE r.course_id=?";
    const queries: ScheduleQuery[] = [
      {
        sql: `DELETE FROM class_session_changes WHERE class_session_id IN (${sessions})`,
        values: [courseId],
      },
      {
        sql: `DELETE FROM class_resource_bookings WHERE class_session_id IN (${sessions})`,
        values: [courseId],
      },
      {
        sql: `DELETE FROM class_teacher_bookings WHERE class_session_id IN (${sessions})`,
        values: [courseId],
      },
      {
        sql: `DELETE FROM class_sessions WHERE id IN (${sessions})`,
        values: [courseId],
      },
      {
        sql: "DELETE FROM timetable_batch_runs WHERE run_id IN (SELECT id FROM class_runs WHERE course_id=?)",
        values: [courseId],
      },
      { sql: "DELETE FROM class_runs WHERE course_id=?", values: [courseId] },
      {
        sql: "DELETE FROM classroom_time_slots WHERE course_id=?",
        values: [courseId],
      },
      {
        sql: "DELETE FROM course_lesson_templates WHERE course_id=?",
        values: [courseId],
      },
      {
        sql: "DELETE FROM course_requirements WHERE course_id=?",
        values: [courseId],
      },
      { sql: "DELETE FROM course_catalogs WHERE id=?", values: [courseId] },
    ];
    try {
      await this.batch(queries);
    } catch (error) {
      if (/FOREIGN KEY/i.test(String(error)))
        throw new AccessError(
          "This course has linked records. Nothing was deleted; keep it for history instead.",
          409,
        );
      throw error;
    }
  }
}
