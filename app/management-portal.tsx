"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type ViewKey = "overview" | "courses" | "enrollment" | "attendance" | "calendar" | "records";
type AnyRecord = Record<string, any>;

type PortalData = {
  courses: AnyRecord[];
  sessions: AnyRecord[];
  classrooms: AnyRecord[];
  teachers: AnyRecord[];
  students: AnyRecord[];
  enrollments: AnyRecord[];
  resourceBookings: AnyRecord[];
  teacherBookings: AnyRecord[];
  studentBookings: AnyRecord[];
  attendance: AnyRecord[];
  conflicts: AnyRecord[];
  metrics: {
    activeCourses: number;
    plannedSessions: number;
    students: number;
    conflicts: number;
    attendanceMarked: number;
  };
};

const emptyData: PortalData = {
  courses: [],
  sessions: [],
  classrooms: [],
  teachers: [],
  students: [],
  enrollments: [],
  resourceBookings: [],
  teacherBookings: [],
  studentBookings: [],
  attendance: [],
  conflicts: [],
  metrics: {
    activeCourses: 0,
    plannedSessions: 0,
    students: 0,
    conflicts: 0,
    attendanceMarked: 0,
  },
};

const navItems: { key: ViewKey; label: string; helper: string }[] = [
  { key: "overview", label: "总览", helper: "今日运营" },
  { key: "courses", label: "课程规划", helper: "课程、课节、老师、教室" },
  { key: "enrollment", label: "学生报名", helper: "报名与费用" },
  { key: "attendance", label: "上课管理", helper: "签到与缺勤" },
  { key: "calendar", label: "教室日历", helper: "资源占用与冲突" },
  { key: "records", label: "基础资料", helper: "老师、学生、教室" },
];

export function ManagementPortal() {
  const [data, setData] = useState<PortalData>(emptyData);
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [selectedCourseId, setSelectedCourseId] = useState("course-cn-y7");
  const [selectedSessionId, setSelectedSessionId] = useState("session-cn-01");
  const [selectedStudentId, setSelectedStudentId] = useState("student-nora");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/portal-data", { cache: "no-store" });
    const payload = (await response.json()) as PortalData & { error?: string };
    if (!payload.error) {
      setData(payload);
      if (!payload.courses.some((course) => course.id === selectedCourseId) && payload.courses[0]) {
        setSelectedCourseId(payload.courses[0].id);
      }
      if (!payload.sessions.some((session) => session.id === selectedSessionId) && payload.sessions[0]) {
        setSelectedSessionId(payload.sessions[0].id);
      }
    }
    setLoading(false);
  }

  async function run(action: string, extra: Record<string, string> = {}) {
    setLoading(true);
    const response = await fetch("/api/portal-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const payload = (await response.json()) as PortalData & { error?: string };
    if (!payload.error) {
      setData(payload);
    }
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const selectedCourse = data.courses.find((course) => course.id === selectedCourseId) ?? data.courses[0];
  const selectedSession = data.sessions.find((session) => session.id === selectedSessionId) ?? data.sessions[0];

  return (
    <main className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <strong>P</strong>
          <span>Teaching Portal</span>
        </div>
        <nav className="portal-nav">
          {navItems.map((item) => (
            <button
              className={activeView === item.key ? "is-active" : ""}
              key={item.key}
              onClick={() => setActiveView(item.key)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.helper}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="portal-workspace">
        <header className="portal-header">
          <div>
            <p>老师 / 管理员视角</p>
            <h1>教学管理系统</h1>
            <span>围绕课程规划、报名、上课签到和教室资源占用来管理。</span>
          </div>
          <button className="solid-action" disabled={loading} onClick={() => run("createCourse")} type="button">
            创建课程规划
          </button>
        </header>

        <MetricStrip data={data} loading={loading} />

        {activeView === "overview" ? (
          <Overview data={data} setView={setActiveView} />
        ) : null}
        {activeView === "courses" ? (
          <CoursePlanner
            data={data}
            run={run}
            selectedCourse={selectedCourse}
            selectedCourseId={selectedCourseId}
            setSelectedCourseId={setSelectedCourseId}
          />
        ) : null}
        {activeView === "enrollment" ? (
          <Enrollment
            data={data}
            run={run}
            selectedCourseId={selectedCourseId}
            selectedStudentId={selectedStudentId}
            setSelectedCourseId={setSelectedCourseId}
            setSelectedStudentId={setSelectedStudentId}
          />
        ) : null}
        {activeView === "attendance" ? (
          <AttendanceManager
            data={data}
            run={run}
            selectedSession={selectedSession}
            selectedSessionId={selectedSessionId}
            setSelectedSessionId={setSelectedSessionId}
          />
        ) : null}
        {activeView === "calendar" ? <ClassroomCalendar data={data} /> : null}
        {activeView === "records" ? <Records data={data} /> : null}
      </section>
    </main>
  );
}

function MetricStrip({ data, loading }: { data: PortalData; loading: boolean }) {
  const metrics = [
    { label: "课程", value: data.metrics.activeCourses },
    { label: "课节", value: data.metrics.plannedSessions },
    { label: "学生", value: data.metrics.students },
    { label: "资源冲突", value: data.metrics.conflicts },
    { label: "已签到记录", value: data.metrics.attendanceMarked },
  ];
  return (
    <section className="metric-strip">
      {metrics.map((metric) => (
        <div className="metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{loading ? "-" : metric.value}</strong>
        </div>
      ))}
    </section>
  );
}

function Overview({ data, setView }: { data: PortalData; setView: (view: ViewKey) => void }) {
  const upcoming = data.sessions.slice(0, 4);
  return (
    <section className="dashboard-grid">
      <Panel title="今日要处理">
        <div className="task-list">
          <button onClick={() => setView("courses")} type="button">规划下一期课程和课节</button>
          <button onClick={() => setView("enrollment")} type="button">处理学生报名与课节费用</button>
          <button onClick={() => setView("attendance")} type="button">进入上课签到</button>
          <button onClick={() => setView("calendar")} type="button">检查教室资源冲突</button>
        </div>
      </Panel>
      <Panel title="即将上课">
        <div className="compact-table">
          {upcoming.map((session) => (
            <div className="compact-row" key={session.id}>
              <span>{session.starts_at}</span>
              <strong>{session.course_name}</strong>
              <em>{session.classroom_name ?? "未排教室"}</em>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="冲突提醒">
        {data.conflicts.length ? (
          <div className="conflict-list">
            {data.conflicts.slice(0, 5).map((conflict, index) => (
              <div className="conflict-item" key={`${conflict.title}-${index}`}>
                <strong>{conflict.title}</strong>
                <span>{conflict.detail}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-note">目前没有资源冲突。</p>
        )}
      </Panel>
    </section>
  );
}

function CoursePlanner({
  data,
  run,
  selectedCourse,
  selectedCourseId,
  setSelectedCourseId,
}: {
  data: PortalData;
  run: (action: string, extra?: Record<string, string>) => void;
  selectedCourse?: AnyRecord;
  selectedCourseId: string;
  setSelectedCourseId: (id: string) => void;
}) {
  const sessions = data.sessions.filter((session) => session.course_id === selectedCourseId);
  const teacherBookings = data.teacherBookings.filter((booking) =>
    sessions.some((session) => session.id === booking.course_session_id),
  );

  return (
    <section className="split-layout">
      <Panel title="课程">
        <div className="toolbar-inline">
          <button onClick={() => run("createCourse")} type="button">新增课程</button>
          <button onClick={() => run("duplicateCourse", { courseId: selectedCourseId })} type="button">复制课程</button>
          <button className="danger" onClick={() => run("deleteCourse", { courseId: selectedCourseId })} type="button">删除课程</button>
        </div>
        <div className="course-list">
          {data.courses.map((course) => (
            <button
              className={course.id === selectedCourseId ? "is-active" : ""}
              key={course.id}
              onClick={() => setSelectedCourseId(course.id)}
              type="button"
            >
              <strong>{course.name}</strong>
              <span>{course.level} · {course.session_count} 节 · {course.student_count} 学生</span>
              <em>{course.status}</em>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="课程规划">
        {selectedCourse ? (
          <div className="detail-stack">
            <div className="course-summary">
              <div>
                <p>课程编号</p>
                <strong>{selectedCourse.code}</strong>
              </div>
              <div>
                <p>价格</p>
                <strong>RM {selectedCourse.price}</strong>
              </div>
              <div>
                <p>总课节</p>
                <strong>{selectedCourse.total_sessions}</strong>
              </div>
              <div>
                <p>状态</p>
                <strong>{selectedCourse.status}</strong>
              </div>
            </div>
            <div className="section-title">
              <h3>课节与资源</h3>
              <button onClick={() => run("addSession", { courseId: selectedCourseId })} type="button">增加课节</button>
            </div>
            <DataTable
              columns={[
                ["session_no", "节次"],
                ["title", "内容"],
                ["starts_at", "开始"],
                ["ends_at", "结束"],
                ["classroom_name", "教室"],
                ["teacher_name", "老师"],
                ["status", "状态"],
              ]}
              rows={sessions}
            />
            <div className="section-title">
              <h3>老师 Booking</h3>
            </div>
            <DataTable
              columns={[
                ["teacher_name", "老师"],
                ["starts_at", "开始"],
                ["ends_at", "结束"],
                ["compensation_amount", "报酬"],
                ["compensation_status", "报酬状态"],
              ]}
              rows={teacherBookings}
            />
          </div>
        ) : (
          <p className="empty-note">还没有课程。</p>
        )}
      </Panel>
    </section>
  );
}

function Enrollment({
  data,
  run,
  selectedCourseId,
  selectedStudentId,
  setSelectedCourseId,
  setSelectedStudentId,
}: {
  data: PortalData;
  run: (action: string, extra?: Record<string, string>) => void;
  selectedCourseId: string;
  selectedStudentId: string;
  setSelectedCourseId: (id: string) => void;
  setSelectedStudentId: (id: string) => void;
}) {
  return (
    <section className="stack-layout">
      <Panel title="帮助学生报名">
        <div className="booking-form">
          <label>
            <span>选择课程</span>
            <select value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>
              {data.courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>选择学生</span>
            <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
              {data.students.map((student) => (
                <option key={student.id} value={student.id}>{student.name}</option>
              ))}
            </select>
          </label>
          <button onClick={() => run("enrollStudent", { courseId: selectedCourseId, studentId: selectedStudentId })} type="button">
            报名并生成学生 Booking
          </button>
        </div>
      </Panel>
      <Panel title="报名记录">
        <DataTable
          columns={[
            ["student_name", "学生"],
            ["course_name", "课程"],
            ["guardian_phone", "家长电话"],
            ["status", "状态"],
            ["created_at", "时间"],
          ]}
          rows={data.enrollments}
        />
      </Panel>
      <Panel title="学生课节费用">
        <DataTable
          columns={[
            ["student_name", "学生"],
            ["course_name", "课程"],
            ["session_title", "课节"],
            ["starts_at", "开始"],
            ["fee_amount", "课节费用"],
            ["payment_status", "付款"],
          ]}
          rows={data.studentBookings}
        />
      </Panel>
    </section>
  );
}

function AttendanceManager({
  data,
  run,
  selectedSession,
  selectedSessionId,
  setSelectedSessionId,
}: {
  data: PortalData;
  run: (action: string, extra?: Record<string, string>) => void;
  selectedSession?: AnyRecord;
  selectedSessionId: string;
  setSelectedSessionId: (id: string) => void;
}) {
  const roster = data.studentBookings.filter((booking) => booking.course_session_id === selectedSessionId);
  return (
    <section className="split-layout">
      <Panel title="课节">
        <div className="course-list">
          {data.sessions.map((session) => (
            <button
              className={session.id === selectedSessionId ? "is-active" : ""}
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              type="button"
            >
              <strong>{session.course_name}</strong>
              <span>{session.title} · {session.starts_at}</span>
              <em>{session.classroom_name ?? "未排教室"}</em>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="签到">
        {selectedSession ? (
          <div className="detail-stack">
            <div className="class-banner">
              <div>
                <strong>{selectedSession.course_name}</strong>
                <span>{selectedSession.title} · {selectedSession.starts_at}</span>
              </div>
              <button onClick={() => run("checkinAll", { sessionId: selectedSessionId })} type="button">全部签到</button>
            </div>
            <div className="roster-list">
              {roster.map((booking) => (
                <div className="roster-row" key={booking.id}>
                  <div>
                    <strong>{booking.student_name}</strong>
                    <span>费用 RM {booking.fee_amount} · {booking.payment_status}</span>
                  </div>
                  <em>{booking.attendance_status ?? "pending"}</em>
                  <button onClick={() => run("markAttendance", { studentBookingId: booking.id, attendanceStatus: "present" })} type="button">签到</button>
                  <button onClick={() => run("markAttendance", { studentBookingId: booking.id, attendanceStatus: "leave" })} type="button">请假</button>
                  <button onClick={() => run("markAttendance", { studentBookingId: booking.id, attendanceStatus: "absent" })} type="button">缺勤</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="empty-note">请选择课节。</p>
        )}
      </Panel>
    </section>
  );
}

function ClassroomCalendar({ data }: { data: PortalData }) {
  return (
    <section className="stack-layout">
      <Panel title="教室日历">
        <div className="calendar-grid">
          {data.classrooms.map((room) => {
            const events = data.resourceBookings.filter((booking) => booking.resource_id === room.id);
            return (
              <div className="room-column" key={room.id}>
                <h3>{room.name}</h3>
                <span>{room.location} · {room.capacity} 人</span>
                {events.map((event) => (
                  <div className="calendar-event" key={event.id}>
                    <strong>{event.course_name}</strong>
                    <span>{event.session_title}</span>
                    <em>{event.starts_at} - {event.ends_at}</em>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="冲突检测">
        {data.conflicts.length ? (
          <div className="conflict-list">
            {data.conflicts.map((conflict, index) => (
              <div className="conflict-item" key={`${conflict.title}-${index}`}>
                <strong>{conflict.title}</strong>
                <span>{conflict.detail}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-note">没有发现教室、老师或学生时间冲突。</p>
        )}
      </Panel>
    </section>
  );
}

function Records({ data }: { data: PortalData }) {
  return (
    <section className="stack-layout">
      <Panel title="老师">
        <DataTable columns={[["code", "编号"], ["name", "姓名"], ["subject", "科目"], ["phone", "电话"], ["status", "状态"]]} rows={data.teachers} />
      </Panel>
      <Panel title="学生">
        <DataTable columns={[["code", "编号"], ["name", "姓名"], ["level", "年级"], ["guardian_phone", "家长电话"], ["status", "状态"]]} rows={data.students} />
      </Panel>
      <Panel title="教室资源">
        <DataTable columns={[["code", "编号"], ["name", "名称"], ["location", "位置"], ["capacity", "容量"], ["status", "状态"]]} rows={data.classrooms} />
      </Panel>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="portal-panel">
      <div className="panel-title">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DataTable({ columns, rows }: { columns: [string, string][]; rows: AnyRecord[] }) {
  return (
    <div className="portal-table-wrap">
      <table className="portal-table">
        <thead>
          <tr>
            {columns.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? index}>
              {columns.map(([key]) => (
                <td key={key}>{String(row[key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
