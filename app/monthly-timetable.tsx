"use client";
import { useState, type FormEvent } from "react";
import type { BusinessRow as Row } from "./lib/business-workflow";
import type { Occurrence } from "./lib/monthly-timetable";
const val = (r: Row | undefined, key: string) => String(r?.[key] ?? "");
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
type Data = {
  campuses?: Row[];
  classrooms: Row[];
  teachers: Row[];
  courses: Row[];
  terms: Row[];
  languages: Row[];
  runs: Row[];
  timetable?: { slots: Row[]; teacherProfiles: Row[] };
};
type Run = (action: string, values?: Row) => Promise<boolean>;
export function MonthlyTimetableWorkspace({
  data,
  busy,
  run,
}: {
  data: Data;
  busy: boolean;
  run: Run;
}) {
  const activeRooms = data.classrooms.filter(
    (r) =>
      r.status === "active" &&
      (!r.campus_id ||
        !data.campuses?.some(
          (c) => c.id === r.campus_id && c.status !== "active",
        )),
  );
  const [campusId, setCampusId] = useState(""),
    [roomId, setRoomId] = useState(val(activeRooms[0], "id")),
    [editingSlot, setEditingSlot] = useState<Row | undefined>(),
    [tab, setTab] = useState("slots"),
    [preview, setPreview] = useState<{
      occurrences: Occurrence[];
      signature: string;
    } | null>(null),
    [input, setInput] = useState<Row>({}),
    [excluded, setExcluded] = useState<string[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID());
  const visibleRooms = activeRooms.filter(
    (r) => !campusId || r.campus_id === campusId,
  );
  const selectedRoom = visibleRooms.find((r) => r.id === roomId);
  async function generate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const values = {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      classroomId: roomId,
    };
    try {
      const response = await fetch("/api/portal-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, action: "previewMonthlyTimetable" }),
      });
      const body = (await response.json()) as {
        preview?: typeof preview;
        error?: string;
      };
      if (!response.ok || !body.preview)
        throw new Error(body.error || "Unable to preview this timetable.");
      setPreview(body.preview);
      setInput(values);
      setExcluded([]);
      setKey(crypto.randomUUID());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to preview.");
    } finally {
      setLoading(false);
    }
  }
  async function apply() {
    if (
      preview &&
      (await run("applyMonthlyTimetable", {
        ...input,
        signature: preview.signature,
        excluded,
        requestKey: key,
      }))
    ) {
      setPreview(null);
      setTab("publish");
    }
  }
  return (
    <section className="workflow-workspace">
      <div className="workflow-heading">
        <div>
          <h2>Monthly classroom timetable</h2>
          <p>
            Approve teachers → configure classroom slots → preview months →
            create draft lessons → publish
          </p>
        </div>
      </div>
      <nav className="workflow-tabs" aria-label="Timetable setup">
        {[
          ["teachers", "Teacher qualifications"],
          ["slots", "Classroom templates"],
          ["generate", "Generate monthly lessons"],
          ["publish", "Publish classes"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error ? (
        <p role="alert" className="workflow-error">
          {error}
        </p>
      ) : null}
      {tab === "teachers" ? (
        <TeacherQualifications data={data} busy={busy} run={run} />
      ) : null}
      {tab === "slots" || tab === "generate" ? (
        <div className="workflow-form-grid">
          <label className="form-field">
            <span>Campus</span>
            <select
              value={campusId}
              onChange={(e) => {
                setCampusId(e.target.value);
                setRoomId(
                  val(
                    activeRooms.find(
                      (r) => !e.target.value || r.campus_id === e.target.value,
                    ),
                    "id",
                  ),
                );
                setEditingSlot(undefined);
                setPreview(null);
              }}
            >
              <option value="">All active campuses</option>
              {data.campuses
                ?.filter((c) => c.status === "active")
                .map((c) => (
                  <option key={val(c, "id")} value={val(c, "id")}>
                    {val(c, "name")}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-field">
            <span>Classroom</span>
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setEditingSlot(undefined);
                setPreview(null);
              }}
            >
              {!selectedRoom ? (
                <option value="">Choose an active classroom</option>
              ) : null}
              {visibleRooms.map((r) => (
                <option key={val(r, "id")} value={val(r, "id")}>
                  {val(r, "campus_name") ||
                    val(
                      data.campuses?.find((c) => c.id === r.campus_id),
                      "name",
                    ) ||
                    "No campus assigned"}{" "}
                  · {val(r, "name")} · {val(r, "capacity")} seats
                </option>
              ))}
            </select>
          </label>
          {!visibleRooms.length ? (
            <p>
              No active classrooms at this campus. Add or activate a classroom
              in Campus setup.
            </p>
          ) : null}
        </div>
      ) : null}
      {tab === "slots" && selectedRoom ? (
        <div className="workflow-split">
          <div className="workflow-card">
            <h3>Weekly template for this classroom</h3>
            <p>
              Breaks and special slots reserve template time. Only teaching
              slots generate lessons.
            </p>
            {data.timetable?.slots
              .filter((s) => s.classroom_id === roomId)
              .map((slot) => (
                <div className="workflow-item" key={val(slot, "id")}>
                  <b>
                    {days[Number(slot.weekday)]} {val(slot, "starts_time")}–
                    {val(slot, "ends_time")}
                  </b>
                  <p>
                    {val(slot, "kind")} ·{" "}
                    {val(slot, "label") ||
                      val(
                        data.courses.find((c) => c.id === slot.course_id),
                        "title",
                      )}
                  </p>
                  <p>
                    {val(
                      data.teachers.find((t) => t.id === slot.teacher_id),
                      "name",
                    )}
                  </p>
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={busy}
                    onClick={() => setEditingSlot(slot)}
                  >
                    Edit template slot
                  </button>
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await run("removeTimetableSlot", { slotId: slot.id })
                      ) {
                        setPreview(null);
                        if (editingSlot?.id === slot.id)
                          setEditingSlot(undefined);
                      }
                    }}
                  >
                    Remove from template
                  </button>
                </div>
              ))}
          </div>
          <SlotForm
            key={roomId + val(editingSlot, "id")}
            data={data}
            roomId={roomId}
            busy={busy}
            run={run}
            slot={editingSlot}
            onSaved={() => {
              setEditingSlot(undefined);
              setPreview(null);
            }}
            onCancel={() => setEditingSlot(undefined)}
          />
        </div>
      ) : null}
      {tab === "generate" ? (
        <div className="workflow-card">
          <form onSubmit={generate} onChange={() => setPreview(null)}>
            <div className="workflow-form-grid">
              <label className="form-field">
                <span>First month</span>
                <input
                  name="month"
                  type="month"
                  defaultValue={new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Kuala_Lumpur",
                    year: "numeric",
                    month: "2-digit",
                  })
                    .format(new Date())
                    .slice(0, 7)}
                  required
                />
              </label>
              <label className="form-field">
                <span>Repeat for months</span>
                <input
                  name="repeats"
                  type="number"
                  min="1"
                  max="12"
                  defaultValue="1"
                  required
                />
              </label>
              <label className="form-field">
                <span>Academic term</span>
                <select name="termId" required>
                  <option value="">Choose</option>
                  {data.terms.map((t) => (
                    <option key={val(t, "id")} value={val(t, "id")}>
                      {val(t, "name")} · {val(t, "starts_on")} –{" "}
                      {val(t, "ends_on")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              Every occurrence of each selected weekday is included, including a
              fifth week. Review the dates and exclude holidays or exceptions
              below.
            </p>
            <button
              type="submit"
              className="primary-button"
              disabled={busy || loading || !selectedRoom}
            >
              {loading ? "Checking timetable…" : "Preview dates & conflicts"}
            </button>
          </form>
          {preview ? (
            <>
              <h3>
                {preview.occurrences.length - excluded.length} selected lessons
              </h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Include</th>
                      <th>Date / time</th>
                      <th>Course</th>
                      <th>Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.occurrences.map((o) => (
                      <tr key={o.key}>
                        <td>
                          <input
                            aria-label={`Include ${o.label} ${o.date}`}
                            type="checkbox"
                            checked={!excluded.includes(o.key)}
                            onChange={(e) =>
                              setExcluded((v) =>
                                e.target.checked
                                  ? v.filter((k) => k !== o.key)
                                  : [...v, o.key],
                              )
                            }
                          />
                        </td>
                        <td>
                          {o.startsAt}–{o.endsAt.slice(11)}
                        </td>
                        <td>{o.label}</td>
                        <td className={o.conflict ? "workflow-error" : ""}>
                          {o.conflict || "Available"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="primary-button"
                type="button"
                disabled={
                  busy ||
                  !preview.occurrences.some((o) => !excluded.includes(o.key)) ||
                  preview.occurrences.some(
                    (o) => o.conflict && !excluded.includes(o.key),
                  )
                }
                onClick={() => void apply()}
              >
                Create selected lessons as draft
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {tab === "publish" ? (
        <div className="workflow-card">
          <h3>Publish reviewed classes</h3>
          <p>
            New classes remain unavailable to students until published. Review
            and edit their lessons in Schedule before publishing.
          </p>
          <div className="workflow-list">
            {data.runs
              .filter((r) => r.status === "draft")
              .map((r) => (
                <div key={val(r, "id")} className="workflow-item">
                  <b>{val(r, "name")}</b>
                  <p>
                    {val(r, "course_title")} · {val(r, "status")}
                  </p>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void run("publishClassRun", { runId: r.id })}
                  >
                    Publish for booking
                  </button>
                </div>
              ))}
            {!data.runs.some((r) => r.status === "draft") ? (
              <p>No draft classes.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
function SlotForm({
  data,
  roomId,
  busy,
  run,
  slot,
  onSaved,
  onCancel,
}: {
  data: Data;
  roomId: string;
  busy: boolean;
  run: Run;
  slot?: Row;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState(val(slot, "kind") || "lesson");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (
      await run("saveTimetableSlot", {
        ...Object.fromEntries(new FormData(form)),
        classroomId: roomId,
        slotId: slot?.id,
      })
    ) {
      form.reset();
      setKind("lesson");
      onSaved();
    }
  }
  return (
    <form className="workflow-card auth-form" onSubmit={submit}>
      <h3>{slot ? "Edit template slot" : "Add time slot"}</h3>
      {slot ? (
        <p>
          Changes apply to future timetable generation. Existing lessons remain
          as scheduled.
        </p>
      ) : null}
      <label className="form-field">
        <span>Slot type</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {["lesson", "break", "special"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <div className="workflow-form-grid">
        <label className="form-field">
          <span>Weekday</span>
          <select name="weekday" defaultValue={val(slot, "weekday") || "1"}>
            {days.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Label (optional)</span>
          <input
            name="label"
            maxLength={200}
            defaultValue={val(slot, "label")}
          />
        </label>
        <label className="form-field">
          <span>Start</span>
          <input
            type="time"
            name="startsTime"
            required
            defaultValue={val(slot, "starts_time")}
          />
        </label>
        <label className="form-field">
          <span>End</span>
          <input
            type="time"
            name="endsTime"
            required
            defaultValue={val(slot, "ends_time")}
          />
        </label>
      </div>
      {kind === "lesson" ? (
        <>
          <label className="form-field">
            <span>Course</span>
            <select
              name="courseId"
              required
              defaultValue={val(slot, "course_id")}
            >
              <option value="">Choose</option>
              {data.courses
                .filter((c) => c.status === "active")
                .map((c) => (
                  <option value={val(c, "id")} key={val(c, "id")}>
                    {val(c, "title")} · {val(c, "level")}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-field">
            <span>Approved teacher</span>
            <select
              name="teacherId"
              required
              defaultValue={val(slot, "teacher_id")}
            >
              <option value="">Choose</option>
              {data.teachers
                .filter(
                  (t) =>
                    !["inactive", "unavailable"].includes(val(t, "status")) &&
                    data.timetable?.teacherProfiles.some(
                      (p) =>
                        p.teacher_id === t.id && p.review_status === "approved",
                    ),
                )
                .map((t) => (
                  <option value={val(t, "id")} key={val(t, "id")}>
                    {val(t, "name")}
                  </option>
                ))}
            </select>
          </label>
          <label className="form-field">
            <span>Teaching language</span>
            <select
              name="languageId"
              required
              defaultValue={val(slot, "language_id")}
            >
              <option value="">Choose</option>
              {data.languages.map((l) => (
                <option key={val(l, "id")} value={val(l, "id")}>
                  {val(l, "name")}
                </option>
              ))}
            </select>
          </label>
          <div className="workflow-form-grid">
            <label className="form-field">
              <span>Seats</span>
              <input
                type="number"
                name="capacity"
                min="1"
                max={Number(
                  data.classrooms.find((r) => r.id === roomId)?.capacity || 100,
                )}
                defaultValue={Number(
                  slot?.capacity ||
                    data.classrooms.find((r) => r.id === roomId)?.capacity ||
                    16,
                )}
                required
              />
            </label>
            <label className="form-field">
              <span>Attendance mode</span>
              <select
                name="deliveryMode"
                defaultValue={val(slot, "delivery_mode") || "onsite"}
              >
                <option value="onsite">Onsite</option>
                <option value="online">Online</option>
              </select>
            </label>
          </div>
        </>
      ) : null}
      <button type="submit" disabled={busy} className="primary-button">
        {slot ? "Save template changes" : "Save slot"}
      </button>
      {slot ? (
        <button
          type="button"
          className="quiet-button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel edit
        </button>
      ) : null}
    </form>
  );
}
function TeacherQualifications({
  data,
  busy,
  run,
}: {
  data: Data;
  busy: boolean;
  run: Run;
}) {
  const [id, setId] = useState(val(data.teachers[0], "id"));
  const profile = data.timetable?.teacherProfiles.find(
    (p) => p.teacher_id === id,
  );
  return (
    <div className="workflow-card">
      <label className="form-field">
        <span>Teacher / candidate</span>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {data.teachers.map((t) => (
            <option key={val(t, "id")} value={val(t, "id")}>
              {val(t, "name")}
            </option>
          ))}
        </select>
      </label>
      <TeacherReviewForm
        key={id + val(profile, "updated_at")}
        id={id}
        profile={profile}
        courses={data.courses}
        busy={busy}
        run={run}
      />
    </div>
  );
}
function TeacherReviewForm({
  id,
  profile,
  courses,
  busy,
  run,
}: {
  id: string;
  profile?: Row;
  courses: Row[];
  busy: boolean;
  run: Run;
}) {
  const [allowed, setAllowed] = useState<string[]>(() =>
      JSON.parse(val(profile, "allowed_courses") || "[]"),
    ),
    [availability, setAvailability] = useState<Row[]>(() =>
      JSON.parse(val(profile, "availability") || "[]"),
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run("saveTeacherQualifications", {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      teacherId: id,
      allowedCourses: allowed,
      availability,
    });
  }
  return (
    <form onSubmit={submit} className="auth-form">
      <h3>Recruitment & teaching approval</h3>
      <div className="workflow-form-grid">
        {[
          ["nickname", "nickname", "Preferred name"],
          ["gender", "gender", "Gender"],
          ["dateOfBirth", "date_of_birth", "Date of birth"],
          ["qualifications", "qualifications", "Qualifications"],
          ["university", "university", "University"],
          ["experienceYears", "experience_years", "Experience (years)"],
        ].map(([name, key, label]) => (
          <label className="form-field" key={name}>
            <span>{label}</span>
            <input
              name={name}
              defaultValue={val(profile, key)}
              type={
                name === "dateOfBirth"
                  ? "date"
                  : name === "experienceYears"
                    ? "number"
                    : "text"
              }
              min={name === "experienceYears" ? 0 : undefined}
              max={name === "experienceYears" ? 80 : undefined}
              maxLength={2000}
            />
          </label>
        ))}
        <label className="form-field">
          <span>Review status</span>
          <select
            name="reviewStatus"
            defaultValue={val(profile, "review_status") || "candidate"}
          >
            {["candidate", "approved", "rejected"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Review note</span>
          <input
            name="reviewNote"
            defaultValue={val(profile, "review_note")}
            maxLength={2000}
          />
        </label>
      </div>
      <details>
        <summary>Courses approved to teach ({allowed.length})</summary>
        <div className="workflow-policy-grid">
          {courses.map((c) => (
            <label className="workflow-check" key={val(c, "id")}>
              <input
                type="checkbox"
                checked={allowed.includes(val(c, "id"))}
                onChange={(e) =>
                  setAllowed((v) =>
                    e.target.checked
                      ? [...v, val(c, "id")]
                      : v.filter((id) => id !== c.id),
                  )
                }
              />
              {val(c, "title")}
            </label>
          ))}
        </div>
      </details>
      <div>
        <h4>Weekly availability</h4>
        {days.map((day, weekday) => {
          const slot = availability.find((a) => a.weekday === weekday);
          return (
            <div className="workflow-actions" key={day}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(slot)}
                  onChange={(e) =>
                    setAvailability((v) =>
                      e.target.checked
                        ? [...v, { weekday, start: "08:00", end: "20:00" }]
                        : v.filter((a) => a.weekday !== weekday),
                    )
                  }
                />{" "}
                {day}
              </label>
              {slot ? (
                <>
                  <input
                    aria-label={`${day} available from`}
                    type="time"
                    value={val(slot, "start")}
                    onChange={(e) =>
                      setAvailability((v) =>
                        v.map((a) =>
                          a.weekday === weekday
                            ? { ...a, start: e.target.value }
                            : a,
                        ),
                      )
                    }
                  />
                  <span>to</span>
                  <input
                    aria-label={`${day} available until`}
                    type="time"
                    value={val(slot, "end")}
                    onChange={(e) =>
                      setAvailability((v) =>
                        v.map((a) =>
                          a.weekday === weekday
                            ? { ...a, end: e.target.value }
                            : a,
                        ),
                      )
                    }
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <button type="submit" disabled={busy} className="primary-button">
        Save teacher review
      </button>
    </form>
  );
}
