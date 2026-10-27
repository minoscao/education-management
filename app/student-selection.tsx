"use client";
import { useState } from "react";
import { CourseEnrollment } from "./course-enrollment";
import { useDialogFocus } from "./lib/use-dialog-focus";
import {
  academicStage,
  membershipReason,
  stageReason,
} from "./lib/booking-policy";
import { malaysiaDay, lessonAvailability } from "./lib/learning-store";
import type { BusinessRow as Row } from "./lib/business-workflow";
import type { WorkflowData } from "./workflow-workspace";
type Data = {
  runs: Row[];
  sessions: Row[];
  students: Row[];
  teachers: Row[];
  passProducts: Row[];
  passes: Row[];
  bookings: Row[];
  workflow: WorkflowData;
};
type Run = (action: string, values?: Row) => Promise<boolean>;
const val = (r: Row | undefined, key: string) => String(r?.[key] ?? "");
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export function StudentSelection({
  data,
  studentId,
  initialMode,
  busy,
  run,
  onMembership,
}: {
  data: Data;
  studentId: string;
  initialMode: "onsite" | "online";
  busy: boolean;
  run: Run;
  onMembership: () => void;
}) {
  const [phase, setPhase] = useState<"onsite" | "online" | "done">(initialMode),
    [stage, setStage] = useState(
      () =>
        academicStage(data.students.find((s) => s.id === studentId) || {}) ||
        "primary",
    ),
    [subject, setSubject] = useState(""),
    [full, setFull] = useState<string[]>([]),
    [anchor, setAnchor] = useState<{ runId: string; sessionId: string } | null>(
      null,
    ),
    [count, setCount] = useState(0);
  const [week, setWeek] = useState(() => {
    const d = malaysiaDay();
    const weekday = new Date(d + "T12:00:00Z").getUTCDay();
    return shift(d, -((weekday + 6) % 7));
  });
  const learner = data.students.find((s) => s.id === studentId),
    member = data.workflow.memberships.find((m) => m.student_id === studentId),
    application = data.workflow.registrations.find(
      (r) => r.student_id === studentId,
    );
  const blocked =
    membershipReason(member, malaysiaDay()) ||
    (application?.registration_status !== "accepted"
      ? "Your registration must be accepted by the campus."
      : "");
  const mode = phase === "online" ? "online" : "onsite";
  const availableRuns = data.runs.filter((r) => r.status === "open");
  const subjects = [...new Set(availableRuns.map((r) => val(r, "subject")))]
    .filter(Boolean)
    .sort();
  const sessions = data.sessions.filter(
    (s) =>
      availableRuns.some((r) => r.id === s.class_run_id) &&
      academicStage(s) === stage &&
      (!subject || s.subject === subject) &&
      s.status !== "cancelled",
  );
  return (
    <section className="workflow-workspace">
      <h2>Choose courses & lessons</h2>
      <p>
        Select onsite learning first, then add individual online lessons if you
        wish.
      </p>
      <div
        className="workflow-mode-step"
        role="group"
        aria-label="Selection steps"
      >
        <button
          className={phase === "onsite" ? "active" : ""}
          onClick={() => setPhase("onsite")}
        >
          1 · Onsite courses / lessons
        </button>
        <button
          className={phase === "online" ? "active" : ""}
          onClick={() => setPhase("online")}
        >
          2 · Optional online lessons
        </button>
        <button
          className={phase === "done" ? "active" : ""}
          onClick={() => setPhase("done")}
        >
          3 · Finish
        </button>
      </div>
      {blocked ? (
        <div className="workflow-alert">
          <p>{blocked}</p>
          <button
            type="button"
            className="primary-button"
            onClick={onMembership}
          >
            Open my membership
          </button>
        </div>
      ) : null}
      {phase === "done" ? (
        <div className="workflow-card">
          <h3>Selection finished</h3>
          <p>
            {count
              ? `${count} reservation${count === 1 ? "" : "s"} saved in this visit. Review your timetable and any course payment due in My courses.`
              : "No additional lessons selected. You can return whenever you are ready."}
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => setPhase("onsite")}
          >
            Choose more lessons
          </button>
        </div>
      ) : (
        <>
          <div className="workflow-actions">
            <div
              className="workflow-tabs"
              role="group"
              aria-label="School stage"
            >
              {(["primary", "secondary"] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  className={stage === v ? "active" : ""}
                  onClick={() => setStage(v)}
                >
                  {v === "primary" ? "Primary" : "Secondary"}
                </button>
              ))}
            </div>
            <label className="form-field">
              <span>Subject</span>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <button
              className="quiet-button"
              type="button"
              onClick={() => setWeek((v) => shift(v, -7))}
            >
              Previous week
            </button>
            <b>
              {week} – {shift(week, 6)}
            </b>
            <button
              className="quiet-button"
              type="button"
              onClick={() => setWeek((v) => shift(v, 7))}
            >
              Next week
            </button>
          </div>
          {phase === "onsite" ? (
            <details className="workflow-full-course">
              <summary>Reserve an entire onsite course</summary>
              <p>
                Tick a course to reserve all its remaining lessons when you
                choose its time slot. Leave it unticked to reserve one lesson.
              </p>
              {availableRuns
                .filter(
                  (r) =>
                    academicStage({ level: r.course_level || r.level, course_title: r.course_title }) === stage &&
                    (!subject || r.subject === subject),
                )
                .map((r) => {
                  const reason = stageReason(learner, r, data.workflow.policy);
                  return (
                    <label className="workflow-check" key={val(r, "id")}>
                      <input
                        type="checkbox"
                        disabled={Boolean(reason || blocked)}
                        checked={full.includes(val(r, "id"))}
                        onChange={(e) =>
                          setFull((v) =>
                            e.target.checked
                              ? [...v, val(r, "id")]
                              : v.filter((id) => id !== r.id),
                          )
                        }
                      />
                      {val(r, "course_title")} · {val(r, "name")}
                      {reason ? <small>{reason}</small> : null}
                    </label>
                  );
                })}
            </details>
          ) : (
            <p className="workflow-muted">
              Online lessons are selected individually. You can finish without
              choosing an online lesson.
            </p>
          )}
          <div className="workflow-matrix">
            {Array.from({ length: 7 }, (_, index) => {
              const date = shift(week, index),
                lessons = sessions.filter(
                  (s) => val(s, "starts_at").slice(0, 10) === date,
                );
              return (
                <div className="workflow-day" key={date}>
                  <h3>
                    {new Date(date + "T12:00:00Z").toLocaleDateString("en-MY", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </h3>
                  {lessons.length ? (
                    lessons.map((s) => {
                      const cls = availableRuns.find(
                        (r) => r.id === s.class_run_id,
                      )!;
                      const availability = lessonAvailability(
                        s,
                        Number(cls.capacity),
                        data.bookings,
                        studentId,
                        mode,
                      );
                      const reason =
                        blocked ||
                        stageReason(
                          learner,
                          { ...s, course_id: cls.course_id },
                          data.workflow.policy,
                        ) ||
                        (availability.booked
                          ? "Already booked"
                          : availability.reason);
                      return (
                        <button
                          className="workflow-slot"
                          disabled={Boolean(reason) || busy}
                          title={reason || "Choose this lesson"}
                          aria-label={`${val(s, "course_title")} ${date} ${val(s, "starts_at").slice(11, 16)}${reason ? " · " + reason : ""}`}
                          type="button"
                          key={val(s, "id")}
                          onClick={() =>
                            setAnchor({
                              runId: val(s, "class_run_id"),
                              sessionId:
                                phase === "onsite" &&
                                full.includes(val(s, "class_run_id"))
                                  ? ""
                                  : val(s, "id"),
                            })
                          }
                        >
                          <strong>
                            {val(s, "starts_at").slice(11, 16)}–
                            {val(s, "ends_at").slice(11, 16)}
                          </strong>
                          <span>{val(s, "course_title")}</span>
                          <small>
                            {val(s, "teacher_name")} · {val(s, "language_name")}
                          </small>
                          {data.workflow.courseRequirements?.find(
                            (r) => r.course_id === cls.course_id,
                          )?.prerequisites ? (
                            <small>
                              Prerequisites:{" "}
                              {val(
                                data.workflow.courseRequirements.find(
                                  (r) => r.course_id === cls.course_id,
                                ),
                                "prerequisites",
                              )}
                            </small>
                          ) : null}
                          <small>
                            {reason
                              ? ""
                              : mode === "online"
                                ? "Online lesson"
                                : `${availability.seats} onsite seats`}
                          </small>
                          {reason ? <small>{reason}</small> : null}
                        </button>
                      );
                    })
                  ) : (
                    <p className="workflow-muted">No lessons</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="workflow-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setPhase(phase === "onsite" ? "online" : "done")}
            >
              {phase === "onsite"
                ? "Continue / skip to optional online lessons"
                : "Finish selection"}
            </button>
          </div>
        </>
      )}
      {anchor ? (
        <SelectionReservation
          key={anchor.runId + anchor.sessionId + mode}
          data={data}
          studentId={studentId}
          anchor={anchor}
          mode={mode}
          busy={busy}
          run={run}
          onClose={() => setAnchor(null)}
          onComplete={() => {
            setAnchor(null);
            setCount((v) => v + 1);
            if (phase === "onsite") setPhase("online");
          }}
        />
      ) : null}
    </section>
  );
}
function SelectionReservation({
  data,
  studentId,
  anchor,
  mode,
  busy,
  run,
  onClose,
  onComplete,
}: {
  data: Data;
  studentId: string;
  anchor: { runId: string; sessionId: string };
  mode: "onsite" | "online";
  busy: boolean;
  run: Run;
  onClose: () => void;
  onComplete: () => void;
}) {
  const ref = useDialogFocus<HTMLElement>(onClose, busy);
  return (
    <CourseEnrollment
      data={data}
      studentId={studentId}
      runId={anchor.runId}
      sessionId={anchor.sessionId}
      mode={mode}
      onMode={() => {}}
      selectionLocked
      busy={busy}
      run={run}
      onClose={onClose}
      onComplete={onComplete}
      dialogRef={ref}
    />
  );
}
