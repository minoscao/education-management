"use client";

import {
  Banknote, BookOpen, CalendarDays, Check, ChevronRight, DoorOpen, GraduationCap,
  LayoutGrid, Map as MapIcon, MapPin, Music2, Plus, School, Search, Settings2, Users, UserRound,
  UserRoundPlus, UsersRound, X,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";

type Row = Record<string, unknown>;
type Language = "en" | "zh";
type View = "calendar" | "campus" | "students" | "teachers" | "courses" | "classrooms" | "classes" | "enrollment" | "reports";
type Detail = { kind: "session" | "student" | "teacher" | "room"; id: string } | null;

type PortalData = {
  terms: Row[]; courses: Row[]; runs: Row[]; sessions: Row[]; students: Row[]; teachers: Row[]; classrooms: Row[];
  enrollments: Row[]; invoices: Row[]; payments: Row[]; attendance: Row[]; resourceBookings: Row[]; teacherBookings: Row[]; conflicts: Row[];
  metrics: { openRuns: number; sessionsThisWeek: number; activeStudents: number; outstanding: number; conflicts: number };
};

const emptyData: PortalData = {
  terms: [], courses: [], runs: [], sessions: [], students: [], teachers: [], classrooms: [], enrollments: [], invoices: [], payments: [], attendance: [], resourceBookings: [], teacherBookings: [], conflicts: [],
  metrics: { openRuns: 0, sessionsThisWeek: 0, activeStudents: 0, outstanding: 0, conflicts: 0 },
};

const copy = {
  en: {
    product: "Teaching Operations", operate: "OPERATE", manage: "MANAGE", calendar: "Calendar", campus: "Campus map", students: "Students", teachers: "Teachers", courses: "Courses", classrooms: "Classrooms", classes: "Classes & schedule", enrollment: "Enrollment & billing", reports: "Reports", refresh: "Refresh", search: "Search", noData: "No records yet", newCourse: "New course", newClass: "Open class", addLesson: "Add lesson", addStudent: "Add student", addTeacher: "Add teacher", addClassroom: "Add classroom", enroll: "Enroll student", markAttendance: "Attendance", roomLayout: "Edit room layout", save: "Save", cancel: "Cancel", currentLesson: "Current lesson", upcoming: "Upcoming", roster: "Students", due: "Outstanding", capacity: "Capacity", term: "Term", subject: "Subject", level: "Level", price: "Price", classRun: "Class", classroom: "Classroom", teacher: "Teacher", lesson: "Lesson", lessonContent: "Lesson content", status: "Status", resources: "Resources", location: "Location", type: "Type", calendarHint: "Choose a day, then open a lesson to manage its class.", mapHint: "A live floor map. Room colours show the next booked lesson.", studentHint: "Student-centred view of classes, fees and attendance.", teacherHint: "Teacher-centred view of teaching load and pay.", classroomHint: "Position rooms on the campus map and define their resources.", courseHint: "Course products define the learning offer and standard price.", classHint: "Open a class, then schedule each lesson with a teacher and room.", billingHint: "Enrollments create lesson bookings and invoices automatically.", reportHint: "A concise view of operational health.", language: "中文", english: "EN", chinese: "中文", present: "Present", late: "Late", leave: "Leave", absent: "Absent", checkIn: "Check in", openDetail: "Open details", noLessons: "No lessons on this day", allRooms: "All rooms", active: "Active", booked: "Booked", select: "Select", start: "Start", end: "End", pay: "Teacher pay", allClear: "No conflicts", conflict: "Conflicts",
  },
  zh: {
    product: "教学运营", operate: "运营", manage: "管理", calendar: "日历", campus: "校园地图", students: "学生", teachers: "老师", courses: "课程", classrooms: "教室", classes: "开班与排课", enrollment: "报名与收费", reports: "报表", refresh: "刷新", search: "搜索", noData: "暂无记录", newCourse: "新建课程", newClass: "开班", addLesson: "新增课节", addStudent: "新增学生", addTeacher: "新增老师", addClassroom: "新增教室", enroll: "学生报名", markAttendance: "签到", roomLayout: "编辑教室布局", save: "保存", cancel: "取消", currentLesson: "当前课节", upcoming: "即将开始", roster: "学生名单", due: "待收款", capacity: "容量", term: "学期", subject: "学科", level: "级别", price: "价格", classRun: "班次", classroom: "教室", teacher: "老师", lesson: "课节", lessonContent: "课节内容", status: "状态", resources: "资源", location: "位置", type: "类型", calendarHint: "选择日期，点击课节即可管理班级。", mapHint: "教室的实时平面图；颜色显示下一节已预订课程。", studentHint: "以学生为中心查看课程、费用和考勤。", teacherHint: "以老师为中心查看课表与课酬。", classroomHint: "在校园地图上摆放教室，并设定教室资源。", courseHint: "课程产品定义教学内容和标准价格。", classHint: "先开班，再安排每一节课的老师与教室。", billingHint: "报名会自动建立课节预订和账单。", reportHint: "关键运营数据一览。", language: "EN", english: "EN", chinese: "中文", present: "出席", late: "迟到", leave: "请假", absent: "缺勤", checkIn: "签到", openDetail: "打开详情", noLessons: "这一天没有课节", allRooms: "全部教室", active: "可用", booked: "已预订", select: "选择", start: "开始", end: "结束", pay: "老师报酬", allClear: "没有冲突", conflict: "冲突",
  },
} as const;

const get = (row: Row | undefined, key: string) => String(row?.[key] ?? "");
const amount = (value: unknown) => `RM ${Number(value ?? 0).toFixed(2)}`;
const datePart = (value: unknown) => String(value ?? "").slice(0, 10);
const timePart = (value: unknown) => String(value ?? "").slice(11, 16);
const minutesOfDay = (value: unknown) => { const [hour, minute] = timePart(value).split(":").map(Number); return hour * 60 + minute; };
const portraitColours = ["#eaf7ff", "#fff4db", "#e9f7ee", "#f5ecff", "#ffede9"];

export function ManagementPortal() {
  const [data, setData] = useState<PortalData>(emptyData);
  const [view, setView] = useState<View>("calendar");
  const [language, setLanguage] = useState<Language>("en");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<Detail>(null);
  const [search, setSearch] = useState("");
  const t = copy[language];

  async function load() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/portal-data", { cache: "no-store" });
      const payload = await response.json() as PortalData & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to load data");
      setData(payload);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load data"); }
    finally { setBusy(false); }
  }

  async function run(action: string, values: Row = {}) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/portal-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
      const payload = await response.json() as PortalData & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "Unable to save changes");
      setData(payload); setMessage(language === "en" ? "Saved" : "已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save changes"); }
    finally { setBusy(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);

  const filteredStudents = useMemo(() => data.students.filter((item) => `${get(item, "name")} ${get(item, "code")}`.toLowerCase().includes(search.toLowerCase())), [data.students, search]);
  const filteredTeachers = useMemo(() => data.teachers.filter((item) => `${get(item, "name")} ${get(item, "subject")}`.toLowerCase().includes(search.toLowerCase())), [data.teachers, search]);

  return <main className="operation-app">
    <aside className="operation-sidebar">
      <div className="operation-brand"><GraduationCap size={22} strokeWidth={2.5} /><span>{t.product}</span></div>
      <NavGroup label={t.operate} current={view} setView={setView} items={[
        ["calendar", CalendarDays, t.calendar], ["campus", MapIcon, t.campus], ["students", Users, t.students], ["teachers", UserRound, t.teachers],
      ]} />
      <NavGroup label={t.manage} current={view} setView={setView} items={[
        ["courses", BookOpen, t.courses], ["classrooms", DoorOpen, t.classrooms], ["classes", LayoutGrid, t.classes], ["enrollment", Banknote, t.enrollment], ["reports", Settings2, t.reports],
      ]} />
      <div className="sidebar-footer"><School size={17} /><span>Campus One</span></div>
    </aside>
    <section className="operation-workspace">
      <header className="operation-header">
        <div className="page-title"><p>{view === "calendar" || view === "campus" || view === "students" || view === "teachers" ? t.operate : t.manage}</p><h1>{pageTitle(view, t)}</h1></div>
        <div className="header-tools">
          <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search} /></label>
          {message ? <span className={message === "Saved" || message === "已保存" ? "save-message ok" : "save-message error"}>{message}</span> : null}
          <button className="language-toggle" onClick={() => setLanguage(language === "en" ? "zh" : "en")} type="button">{t.language}</button>
          <button className="header-icon" onClick={() => void load()} type="button" title={t.refresh} disabled={busy}><ChevronRight size={18} /></button>
        </div>
      </header>
      {view === "calendar" ? <CalendarView data={data} t={t} onOpen={(id) => setDetail({ kind: "session", id })} /> : null}
      {view === "campus" ? <CampusView data={data} t={t} onOpenSession={(id) => setDetail({ kind: "session", id })} onOpenRoom={(id) => setDetail({ kind: "room", id })} /> : null}
      {view === "students" ? <DirectoryView type="student" rows={filteredStudents} data={data} t={t} onOpen={(id) => setDetail({ kind: "student", id })} /> : null}
      {view === "teachers" ? <DirectoryView type="teacher" rows={filteredTeachers} data={data} t={t} onOpen={(id) => setDetail({ kind: "teacher", id })} /> : null}
      {view === "courses" ? <CourseManager data={data} run={run} busy={busy} t={t} /> : null}
      {view === "classrooms" ? <ClassroomManager data={data} run={run} busy={busy} t={t} onOpenRoom={(id) => setDetail({ kind: "room", id })} /> : null}
      {view === "classes" ? <ClassManager data={data} run={run} busy={busy} t={t} onOpen={(id) => setDetail({ kind: "session", id })} /> : null}
      {view === "enrollment" ? <EnrollmentManager data={data} run={run} busy={busy} t={t} /> : null}
      {view === "reports" ? <ReportView data={data} t={t} /> : null}
    </section>
    {detail ? <DetailSheet detail={detail} data={data} t={t} busy={busy} run={run} close={() => setDetail(null)} /> : null}
  </main>;
}

function pageTitle(view: View, t: typeof copy.en) {
  const titles: Record<View, string> = { calendar: t.calendar, campus: t.campus, students: t.students, teachers: t.teachers, courses: t.courses, classrooms: t.classrooms, classes: t.classes, enrollment: t.enrollment, reports: t.reports };
  return titles[view];
}

function NavGroup({ label, current, setView, items }: { label: string; current: View; setView: (value: View) => void; items: [View, typeof CalendarDays, string][] }) {
  return <div className="nav-group"><span className="nav-label">{label}</span>{items.map(([key, Icon, title]) => <button key={key} type="button" className={current === key ? "active" : ""} onClick={() => setView(key)}><Icon size={18} /><span>{title}</span></button>)}</div>;
}

function CalendarView({ data, t, onOpen }: { data: PortalData; t: typeof copy.en; onOpen: (id: string) => void }) {
  const dates = useMemo(() => [...new Set(data.sessions.map((item) => datePart(item.starts_at)))].filter(Boolean).sort(), [data.sessions]);
  const [selectedDate, setSelectedDate] = useState("");
  const date = selectedDate && dates.includes(selectedDate) ? selectedDate : dates[0] ?? "";
  const lessons = data.sessions.filter((item) => datePart(item.starts_at) === date);
  const rooms = data.classrooms.filter((room) => lessons.some((lesson) => get(lesson, "classroom_name") === get(room, "name")));
  return <section className="operation-stack">
    <div className="view-intro"><div><h2>{t.calendar}</h2><p>{t.calendarHint}</p></div><MetricPills data={data} t={t} /></div>
    <div className="date-strip">{dates.map((item) => <button type="button" key={item} className={item === date ? "active" : ""} onClick={() => setSelectedDate(item)}><strong>{new Date(`${item}T12:00`).toLocaleDateString("en", { weekday: "short" })}</strong><span>{new Date(`${item}T12:00`).toLocaleDateString("en", { month: "short", day: "numeric" })}</span></button>)}</div>
    <section className="calendar-board">
      <div className="calendar-corner"><CalendarDays size={18} /><span>{date || "-"}</span></div>
      <div className="calendar-room-heads">{rooms.map((room) => <div key={get(room, "id")}><DoorOpen size={15} /><span>{get(room, "name")}</span></div>)}</div>
      <div className="time-scale">{[8, 10, 12, 14, 16, 18, 20].map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>
      <div className="calendar-columns">{rooms.map((room) => <RoomTimeline key={get(room, "id")} lessons={lessons.filter((lesson) => get(lesson, "classroom_name") === get(room, "name"))} onOpen={onOpen} />)}</div>
      {!lessons.length ? <div className="calendar-empty">{t.noLessons}</div> : null}
    </section>
  </section>;
}

function RoomTimeline({ lessons, onOpen }: { lessons: Row[]; onOpen: (id: string) => void }) {
  return <div className="room-timeline">{lessons.map((lesson) => {
    const top = Math.max(0, ((minutesOfDay(lesson.starts_at) - 480) / 720) * 100);
    const height = Math.max(9, ((minutesOfDay(lesson.ends_at) - minutesOfDay(lesson.starts_at)) / 720) * 100);
    return <button key={get(lesson, "id")} type="button" className="lesson-block" style={{ top: `${top}%`, height: `${height}%` }} onClick={() => onOpen(get(lesson, "id"))}><span>{timePart(lesson.starts_at)}</span><strong>{get(lesson, "course_title")}</strong><em>{get(lesson, "topic")}</em><small>{get(lesson, "teacher_name")}</small></button>;
  })}</div>;
}

function CampusView({ data, t, onOpenSession, onOpenRoom }: { data: PortalData; t: typeof copy.en; onOpenSession: (id: string) => void; onOpenRoom: (id: string) => void }) {
  const nextByRoom = new Map<string, Row>();
  data.sessions.forEach((session) => { const key = get(session, "classroom_name"); if (key && !nextByRoom.has(key)) nextByRoom.set(key, session); });
  return <section className="operation-stack"><div className="view-intro"><div><h2>{t.campus}</h2><p>{t.mapHint}</p></div><div className="map-legend"><span><i className="free" />{t.active}</span><span><i className="occupied" />{t.booked}</span></div></div><FloorMap rooms={data.classrooms} sessionsByRoom={nextByRoom} editable={false} onOpenSession={onOpenSession} onOpenRoom={onOpenRoom} /></section>;
}

function FloorMap({ rooms, sessionsByRoom, editable, onOpenSession, onOpenRoom, onDropRoom }: { rooms: Row[]; sessionsByRoom: Map<string, Row>; editable: boolean; onOpenSession: (id: string) => void; onOpenRoom: (id: string) => void; onDropRoom?: (room: Row, event: React.DragEvent<HTMLButtonElement>) => void }) {
  return <div className={editable ? "floor-map editing" : "floor-map"}><div className="map-entry"><MapPin size={17} /><span>Campus One · Level 2</span></div><div className="map-hall">MAIN WALKWAY</div>{rooms.map((room, index) => { const next = sessionsByRoom.get(get(room, "name")); return <button draggable={editable} onDragEnd={(event) => onDropRoom?.(room, event)} type="button" key={get(room, "id")} className={next ? "map-room occupied" : "map-room"} style={{ left: `${Number(room.map_x ?? 80)}px`, top: `${Number(room.map_y ?? 80)}px`, width: `${Number(room.map_width ?? 180)}px`, height: `${Number(room.map_height ?? 110)}px`, "--room-colour": portraitColours[index % portraitColours.length] } as React.CSSProperties} onClick={() => next && !editable ? onOpenSession(get(next, "id")) : onOpenRoom(get(room, "id"))}><DoorOpen size={20} /><strong>{get(room, "name")}</strong><span>{get(room, "room_type") || "classroom"}</span>{next ? <em>{get(next, "course_title")} · {timePart(next.starts_at)}</em> : <small>{get(room, "resources") || "Available"}</small>}</button>; })}</div>;
}

function DirectoryView({ type, rows, data, t, onOpen }: { type: "student" | "teacher"; rows: Row[]; data: PortalData; t: typeof copy.en; onOpen: (id: string) => void }) {
  const isStudent = type === "student";
  return <section className="operation-stack"><div className="view-intro"><div><h2>{isStudent ? t.students : t.teachers}</h2><p>{isStudent ? t.studentHint : t.teacherHint}</p></div><span className="record-count">{rows.length}</span></div><div className="directory-grid">{rows.map((person, index) => { const personId = get(person, "id"); const lessons = isStudent ? data.attendance.filter((item) => get(item, "student_id") === personId) : data.teacherBookings.filter((item) => get(item, "teacher_id") === personId); const active = isStudent ? data.enrollments.filter((item) => get(item, "student_id") === personId && get(item, "status") === "enrolled").length : lessons.length; return <button className="person-card" type="button" key={personId} onClick={() => onOpen(personId)}><div className="person-avatar" style={{ background: portraitColours[index % portraitColours.length] }}>{isStudent ? <GraduationCap size={25} /> : <UserRound size={25} />}</div><div className="person-main"><strong>{get(person, "name")}</strong><span>{isStudent ? get(person, "level") : get(person, "subject")}</span></div><Status value={get(person, "status")} /><div className="person-stats"><span><b>{active}</b>{isStudent ? " classes" : " lessons"}</span><span>{isStudent ? get(person, "guardian_phone") : get(person, "phone")}</span></div><div className="person-action">{t.openDetail}<ChevronRight size={15} /></div></button>; })}{!rows.length ? <Empty text={t.noData} /> : null}</div></section>;
}

function CourseManager({ data, run, busy, t }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean; t: typeof copy.en }) {
  const [showForm, setShowForm] = useState(false);
  return <section className="operation-stack"><div className="view-intro"><div><h2>{t.courses}</h2><p>{t.courseHint}</p></div><button className="primary-button" type="button" onClick={() => setShowForm(!showForm)}><Plus size={16} />{t.newCourse}</button></div>{showForm ? <CourseForm run={run} busy={busy} close={() => setShowForm(false)} t={t} /> : null}<div className="course-grid">{data.courses.map((course, index) => <article key={get(course, "id")} className="course-card"><CourseVisual course={course} index={index} /><div className="course-body"><span className="code">{get(course, "code")}</span><h3>{get(course, "title")}</h3><p>{get(course, "subject")} · {get(course, "level")}</p><div className="course-facts"><span><CalendarDays size={15} />{get(course, "default_sessions")} lessons</span><span><Banknote size={15} />{amount(course.list_price)}</span></div><footer><Status value={get(course, "status")} /><span>{get(course, "run_count")} classes</span></footer></div></article>)}</div></section>;
}

function CourseVisual({ course, index }: { course: Row; index: number }) { const subject = get(course, "subject").toLowerCase(); const Icon = subject.includes("music") || subject.includes("violin") ? Music2 : subject.includes("math") ? LayoutGrid : BookOpen; return <div className={`course-visual course-colour-${index % 4}`}><Icon size={34} /><span>{get(course, "subject").slice(0, 2).toUpperCase()}</span></div>; }

function CourseForm({ run, busy, close, t }: { run: (action: string, values?: Row) => Promise<void>; busy: boolean; close: () => void; t: typeof copy.en }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void run("createCourse", values).then(close); }
  return <form className="inline-form" onSubmit={submit}><FormField name="title" label="Course name" required /><FormField name="subject" label={t.subject} required /><FormField name="level" label={t.level} required /><FormField name="sessions" type="number" label="Lessons" defaultValue="8" min="1" required /><FormField name="minutes" type="number" label="Minutes" defaultValue="90" min="30" required /><FormField name="price" type="number" label={`${t.price} (RM)`} defaultValue="0" min="0" step="0.01" required /><button className="primary-button" disabled={busy} type="submit"><Check size={16} />{t.save}</button><button className="quiet-button" type="button" onClick={close}>{t.cancel}</button></form>;
}

function ClassroomManager({ data, run, busy, t, onOpenRoom }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean; t: typeof copy.en; onOpenRoom: (id: string) => void }) {
  const [editing, setEditing] = useState(false); const [selectedId, setSelectedId] = useState(""); const mapRef = useRef<HTMLDivElement>(null);
  const selected = data.classrooms.find((item) => get(item, "id") === selectedId) ?? data.classrooms[0];
  const sessionsByRoom = useMemo(() => { const map = new Map<string, Row>(); data.sessions.forEach((item) => { const key = get(item, "classroom_name"); if (key && !map.has(key)) map.set(key, item); }); return map; }, [data.sessions]);
  function drop(room: Row, event: React.DragEvent<HTMLButtonElement>) { if (!mapRef.current) return; const rect = mapRef.current.getBoundingClientRect(); const x = Math.max(10, Math.round((event.clientX - rect.left) * (680 / rect.width) - Number(room.map_width ?? 180) / 2)); const y = Math.max(52, Math.round((event.clientY - rect.top) * (430 / rect.height) - Number(room.map_height ?? 110) / 2)); void run("updateClassroomMap", { classroomId: get(room, "id"), mapX: x, mapY: y, mapWidth: room.map_width, mapHeight: room.map_height, roomType: room.room_type, resources: room.resources }); }
  function saveLayout(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void run("updateClassroomMap", { ...values, classroomId: get(selected, "id") }); }
  return <section className="operation-stack"><div className="view-intro"><div><h2>{t.classrooms}</h2><p>{t.classroomHint}</p></div><button className={editing ? "quiet-button active" : "primary-button"} type="button" onClick={() => setEditing(!editing)}><MapIcon size={16} />{t.roomLayout}</button></div><div ref={mapRef}><FloorMap rooms={data.classrooms} sessionsByRoom={sessionsByRoom} editable={editing} onOpenSession={() => undefined} onOpenRoom={(id) => { setSelectedId(id); onOpenRoom(id); }} onDropRoom={drop} /></div>{editing && selected ? <form className="inline-form compact" onSubmit={saveLayout}><SelectField name="classroomId" label={t.classroom} rows={data.classrooms} value={get(selected, "id")} onChange={setSelectedId} /><FormField name="roomType" label={t.type} defaultValue={get(selected, "room_type")} /><FormField name="resources" label={t.resources} defaultValue={get(selected, "resources")} /><FormField name="mapWidth" label="Width" type="number" defaultValue={get(selected, "map_width")} min="80" /><FormField name="mapHeight" label="Height" type="number" defaultValue={get(selected, "map_height")} min="60" /><button className="primary-button" disabled={busy} type="submit"><Check size={16} />{t.save}</button></form> : null}<Table columns={[["code", "Code"], ["name", t.classroom], ["location", t.location], ["room_type", t.type], ["resources", t.resources], ["capacity", t.capacity], ["status", t.status]]} rows={data.classrooms} empty={t.noData} /></section>;
}

function ClassManager({ data, run, busy, t, onOpen }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean; t: typeof copy.en; onOpen: (id: string) => void }) {
  const [runId, setRunId] = useState(""); const activeRun = runId || get(data.runs[0], "id"); const runSessions = data.sessions.filter((item) => get(item, "class_run_id") === activeRun);
  function createRun(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void run("createClassRun", values); event.currentTarget.reset(); }
  function createSession(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void run("createSession", values); event.currentTarget.reset(); }
  return <section className="operation-stack"><div className="view-intro"><div><h2>{t.classes}</h2><p>{t.classHint}</p></div></div><section className="management-panel"><h3>{t.newClass}</h3><form className="inline-form" onSubmit={createRun}><SelectField name="courseId" label={t.courses} rows={data.courses} value="" /><SelectField name="termId" label={t.term} rows={data.terms} value="" /><FormField name="name" label="Class name" required /><FormField name="capacity" type="number" label={t.capacity} defaultValue="16" min="1" required /><FormField name="price" type="number" label={`${t.price} (RM)`} defaultValue="0" min="0" /><button className="primary-button" disabled={busy} type="submit"><Plus size={16} />{t.newClass}</button></form></section><section className="management-panel"><div className="panel-row"><h3>{t.classes}</h3><SelectField name="run" label={t.classRun} rows={data.runs} value={activeRun} onChange={setRunId} /></div><Table columns={[["code", "Code"], ["course_title", t.courses], ["name", t.classRun], ["term_name", t.term], ["student_count", t.students], ["capacity", t.capacity], ["session_count", "Lessons"], ["price", t.price], ["status", t.status]]} rows={data.runs} moneyKeys={["price"]} empty={t.noData} /></section><section className="management-panel"><h3>{t.addLesson}</h3><form className="inline-form lesson-form" onSubmit={createSession}><SelectField name="runId" label={t.classRun} rows={data.runs} value={activeRun} onChange={setRunId} /><FormField name="topic" label={t.lessonContent} required /><FormField name="startsAt" type="datetime-local" label={t.start} required /><FormField name="endsAt" type="datetime-local" label={t.end} required /><SelectField name="classroomId" label={t.classroom} rows={data.classrooms} value="" /><SelectField name="teacherId" label={t.teacher} rows={data.teachers} value="" /><FormField name="payAmount" type="number" label={`${t.pay} (RM)`} defaultValue="0" min="0" /><button className="primary-button" disabled={busy || !activeRun} type="submit"><Plus size={16} />{t.addLesson}</button></form><ClickableTable columns={[["session_no", "#"], ["topic", t.lessonContent], ["starts_at", t.start], ["teacher_name", t.teacher], ["classroom_name", t.classroom], ["pay_amount", t.pay], ["status", t.status]]} rows={runSessions} moneyKeys={["pay_amount"]} empty={t.noData} onOpen={onOpen} /></section></section>;
}

function EnrollmentManager({ data, run, busy, t }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean; t: typeof copy.en }) {
  function enroll(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void run("enrollStudent", values); event.currentTarget.reset(); }
  return <section className="operation-stack"><div className="view-intro"><div><h2>{t.enrollment}</h2><p>{t.billingHint}</p></div></div><section className="management-panel"><h3>{t.enroll}</h3><form className="inline-form compact" onSubmit={enroll}><SelectField name="runId" label={t.classRun} rows={data.runs.filter((item) => get(item, "status") === "open")} value="" /><SelectField name="studentId" label={t.students} rows={data.students.filter((item) => get(item, "status") === "active")} value="" /><button className="primary-button" disabled={busy} type="submit"><UserRoundPlus size={16} />{t.enroll}</button></form></section><section className="management-panel"><h3>{t.enrollment}</h3><Table columns={[["student_name", t.students], ["course_title", t.courses], ["run_name", t.classRun], ["contracted_fee", "Contract"], ["invoice_no", "Invoice"], ["paid_amount", "Paid"], ["invoice_status", "Invoice status"], ["status", t.status]]} rows={data.enrollments} moneyKeys={["contracted_fee", "paid_amount"]} empty={t.noData} /></section><section className="management-panel"><h3>Invoices</h3><InvoiceTable rows={data.invoices} run={run} busy={busy} /></section></section>;
}

function ReportView({ data, t }: { data: PortalData; t: typeof copy.en }) { return <section className="operation-stack"><div className="view-intro"><div><h2>{t.reports}</h2><p>{t.reportHint}</p></div></div><section className="report-grid"><ReportCard icon={<UsersRound size={20} />} label={t.students} value={data.metrics.activeStudents} note="Active student records" /><ReportCard icon={<CalendarDays size={20} />} label="Lessons this week" value={data.metrics.sessionsThisWeek} note="Scheduled in the coming 7 days" /><ReportCard icon={<Banknote size={20} />} label={t.due} value={amount(data.metrics.outstanding)} note="Across open invoices" /><ReportCard icon={<Settings2 size={20} />} label={t.conflict} value={data.metrics.conflicts} note={data.metrics.conflicts ? "Needs attention" : t.allClear} /></section><section className="management-panel"><h3>{t.conflict}</h3><Table columns={[["kind", "Type"], ["resource", "Resource"], ["first", "First booking"], ["second", "Second booking"], ["starts_at", t.start]]} rows={data.conflicts} empty={t.allClear} /></section></section>; }
function MetricPills({ data, t }: { data: PortalData; t: typeof copy.en }) { return <div className="metric-pills"><span><b>{data.metrics.openRuns}</b> {t.classes}</span><span><b>{data.metrics.activeStudents}</b> {t.students}</span><span><b>{amount(data.metrics.outstanding)}</b> {t.due}</span></div>; }
function ReportCard({ icon, label, value, note }: { icon: ReactNode; label: string; value: string | number; note: string }) { return <article className="report-card"><span>{icon}</span><p>{label}</p><strong>{value}</strong><small>{note}</small></article>; }

function DetailSheet({ detail, data, t, busy, run, close }: { detail: Exclude<Detail, null>; data: PortalData; t: typeof copy.en; busy: boolean; run: (action: string, values?: Row) => Promise<void>; close: () => void }) {
  const item = detail.kind === "session" ? data.sessions.find((row) => get(row, "id") === detail.id) : detail.kind === "student" ? data.students.find((row) => get(row, "id") === detail.id) : detail.kind === "teacher" ? data.teachers.find((row) => get(row, "id") === detail.id) : data.classrooms.find((row) => get(row, "id") === detail.id);
  const [enrollStudentId, setEnrollStudentId] = useState("");
  if (!item) return null;
  const sessionRoster = detail.kind === "session" ? data.attendance.filter((row) => get(row, "class_session_id") === detail.id) : [];
  const studentEnrollments = detail.kind === "student" ? data.enrollments.filter((row) => get(row, "student_id") === detail.id) : [];
  const teacherLessons = detail.kind === "teacher" ? data.teacherBookings.filter((row) => get(row, "teacher_id") === detail.id) : [];
  const roomLessons = detail.kind === "room" ? data.sessions.filter((row) => get(row, "classroom_name") === get(item, "name")) : [];
  const title = detail.kind === "session" ? get(item, "course_title") : get(item, "name");
  const subtitle = detail.kind === "session" ? `${get(item, "topic")} · ${get(item, "starts_at")}` : detail.kind === "student" ? get(item, "level") : detail.kind === "teacher" ? get(item, "subject") : `${get(item, "location")} · ${get(item, "capacity")} seats`;
  return <div className="sheet-backdrop" role="presentation" onMouseDown={close}><aside className="detail-sheet" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="sheet-eyebrow">{detail.kind === "session" ? t.lesson : detail.kind === "student" ? t.students : detail.kind === "teacher" ? t.teachers : t.classroom}</span><h2>{title}</h2><p>{subtitle}</p></div><button className="header-icon" type="button" onClick={close} title={t.cancel}><X size={18} /></button></header>{detail.kind === "session" ? <><section className="sheet-overview"><Info label={t.classRun} value={get(item, "run_name")} /><Info label={t.teacher} value={get(item, "teacher_name")} /><Info label={t.classroom} value={get(item, "classroom_name")} /><Info label="Lesson #" value={get(item, "session_no")} /></section><section className="sheet-section"><div className="sheet-section-title"><h3>{t.roster}</h3><span>{sessionRoster.length}</span></div>{sessionRoster.map((row) => <div className="sheet-roster" key={get(row, "id")}><div><strong>{get(row, "student_name")}</strong><small>{amount(row.allocated_fee)}</small></div><Status value={get(row, "status")} /><div className="attendance-buttons">{[["present", t.present], ["late", t.late], ["leave", t.leave], ["absent", t.absent]].map(([status, label]) => <button type="button" key={status} disabled={busy} className={get(row, "status") === status ? "selected" : ""} onClick={() => void run("setAttendance", { studentBookingId: get(row, "student_booking_id"), attendanceStatus: status })}>{label}</button>)}</div></div>)}</section><section className="sheet-section"><div className="sheet-section-title"><h3>{t.enroll}</h3></div><div className="sheet-enroll"><select value={enrollStudentId} onChange={(event) => setEnrollStudentId(event.target.value)}><option value="">{t.select} {t.students}</option>{data.students.filter((student) => !sessionRoster.some((row) => get(row, "student_id") === get(student, "id"))).map((student) => <option key={get(student, "id")} value={get(student, "id")}>{get(student, "name")}</option>)}</select><button className="primary-button" disabled={busy || !enrollStudentId} type="button" onClick={() => void run("enrollStudent", { runId: get(item, "class_run_id"), studentId: enrollStudentId })}><Plus size={15} />{t.enroll}</button></div></section></> : null}{detail.kind === "student" ? <ListSection title={t.enrollment} rows={studentEnrollments} fields={[["course_title", t.courses], ["run_name", t.classRun], ["contracted_fee", "Contract"], ["invoice_status", "Invoice"]]} moneyKeys={["contracted_fee"]} /> : null}{detail.kind === "teacher" ? <ListSection title="Teaching schedule" rows={teacherLessons} fields={[["course_title", t.courses], ["run_name", t.classRun], ["topic", t.lesson], ["starts_at", t.start], ["pay_amount", t.pay], ["pay_status", t.status]]} moneyKeys={["pay_amount"]} /> : null}{detail.kind === "room" ? <ListSection title="Room schedule" rows={roomLessons} fields={[["course_title", t.courses], ["run_name", t.classRun], ["topic", t.lesson], ["starts_at", t.start], ["teacher_name", t.teacher]]} /> : null}</aside></div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value || "-"}</strong></div>; }
function ListSection({ title, rows, fields, moneyKeys = [] }: { title: string; rows: Row[]; fields: [string, string][]; moneyKeys?: string[] }) { return <section className="sheet-section"><div className="sheet-section-title"><h3>{title}</h3><span>{rows.length}</span></div>{rows.map((row) => <div className="sheet-list-row" key={get(row, "id")}>{fields.map(([key, label]) => <div key={key}><span>{label}</span><strong>{moneyKeys.includes(key) ? amount(row[key]) : get(row, key)}</strong></div>)}</div>)}{!rows.length ? <Empty text="No records" /> : null}</section>; }

function Table({ columns, rows, empty, moneyKeys = [] }: { columns: [string, string][]; rows: Row[]; empty: string; moneyKeys?: string[] }) { return <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={get(row, "id")}>{columns.map(([key]) => <td key={key}>{key.includes("status") ? <Status value={get(row, key)} /> : moneyKeys.includes(key) ? amount(row[key]) : get(row, key) || "-"}</td>)}</tr>)}{!rows.length ? <tr><td className="empty-cell" colSpan={columns.length}>{empty}</td></tr> : null}</tbody></table></div>; }
function ClickableTable({ columns, rows, empty, moneyKeys = [], onOpen }: { columns: [string, string][]; rows: Row[]; empty: string; moneyKeys?: string[]; onOpen: (id: string) => void }) { return <div className="table-scroll"><table className="data-table clickable"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={get(row, "id")} onClick={() => onOpen(get(row, "id"))}>{columns.map(([key]) => <td key={key}>{key.includes("status") ? <Status value={get(row, key)} /> : moneyKeys.includes(key) ? amount(row[key]) : get(row, key) || "-"}</td>)}</tr>)}{!rows.length ? <tr><td className="empty-cell" colSpan={columns.length}>{empty}</td></tr> : null}</tbody></table></div>; }
function InvoiceTable({ rows, run, busy }: { rows: Row[]; run: (action: string, values?: Row) => Promise<void>; busy: boolean }) { return <div className="table-scroll"><table className="data-table"><thead><tr><th>Invoice</th><th>Student</th><th>Course</th><th>Due</th><th>Paid</th><th>Balance</th><th>Status</th><th /></tr></thead><tbody>{rows.map((row) => { const balance = Math.max(0, Number(row.total_amount) - Number(row.paid_amount)); return <tr key={get(row, "id")}><td>{get(row, "invoice_no")}</td><td>{get(row, "student_name")}</td><td>{get(row, "course_title")}</td><td>{amount(row.total_amount)}</td><td>{amount(row.paid_amount)}</td><td>{amount(balance)}</td><td><Status value={get(row, "status")} /></td><td>{balance > 0 ? <button className="table-button" disabled={busy} type="button" onClick={() => void run("recordPayment", { invoiceId: get(row, "id"), amount: balance })}>Receive</button> : null}</td></tr>; })}</tbody></table></div>; }
function Status({ value }: { value: string }) { return <span className={`status-chip status-${value}`}>{value || "-"}</span>; }
function Empty({ text }: { text: string }) { return <div className="empty-block">{text}</div>; }
function FormField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <label className="form-field"><span>{label}</span><input {...props} /></label>; }
function SelectField({ label, rows, value, onChange, ...props }: { label: string; rows: Row[]; value?: string; onChange?: (value: string) => void } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  const control = value === undefined ? {} : { value, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange?.(event.target.value) };
  return <label className="form-field"><span>{label}</span><select {...props} {...control}>{!rows.length ? <option value="">No options</option> : null}{rows.map((row) => <option key={get(row, "id")} value={get(row, "id")}>{get(row, "name") || get(row, "title")} {get(row, "code") ? `· ${get(row, "code")}` : ""}</option>)}</select></label>;
}
