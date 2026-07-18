"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

type Row = Record<string, unknown>;
type View = "overview" | "catalog" | "classes" | "enrollment" | "teaching" | "calendar" | "records";

type PortalData = {
  terms: Row[];
  courses: Row[];
  runs: Row[];
  sessions: Row[];
  students: Row[];
  teachers: Row[];
  classrooms: Row[];
  enrollments: Row[];
  invoices: Row[];
  payments: Row[];
  attendance: Row[];
  resourceBookings: Row[];
  teacherBookings: Row[];
  conflicts: Row[];
  metrics: { openRuns: number; sessionsThisWeek: number; activeStudents: number; outstanding: number; conflicts: number };
};

const empty: PortalData = {
  terms: [], courses: [], runs: [], sessions: [], students: [], teachers: [], classrooms: [], enrollments: [], invoices: [], payments: [], attendance: [], resourceBookings: [], teacherBookings: [], conflicts: [],
  metrics: { openRuns: 0, sessionsThisWeek: 0, activeStudents: 0, outstanding: 0, conflicts: 0 },
};

const navigation: { key: View; label: string; description: string }[] = [
  { key: "overview", label: "工作台", description: "今日待办" },
  { key: "catalog", label: "课程产品", description: "课程定义与定价" },
  { key: "classes", label: "开班与排课", description: "班次、课节、师资和教室" },
  { key: "enrollment", label: "报名与收费", description: "报名、账单和收款" },
  { key: "teaching", label: "上课管理", description: "点名与课节记录" },
  { key: "calendar", label: "资源日历", description: "教室和老师占用" },
  { key: "records", label: "基础资料", description: "学生、老师和教室" },
];

const money = (value: unknown) => `RM ${Number(value ?? 0).toFixed(2)}`;

export function ManagementPortal() {
  const [data, setData] = useState<PortalData>(empty);
  const [view, setView] = useState<View>("overview");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");

  async function load() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/portal-data", { cache: "no-store" });
      const payload = await response.json() as PortalData & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "读取失败");
      setData(payload);
      setSelectedRunId((current) => payload.runs.some((run) => run.id === current) ? current : payload.runs[0]?.id ?? "");
      setSelectedSessionId((current) => payload.sessions.some((session) => session.id === current) ? current : payload.sessions[0]?.id ?? "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "读取失败");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: string, values: Row = {}) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/portal-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      });
      const payload = await response.json() as PortalData & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "保存失败");
      setData(payload);
      setSelectedRunId((current) => payload.runs.some((run) => run.id === current) ? current : payload.runs[0]?.id ?? "");
      setSelectedSessionId((current) => payload.sessions.some((session) => session.id === current) ? current : payload.sessions[0]?.id ?? "");
      setNotice("已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="ops-shell">
      <aside className="ops-sidebar">
        <div className="ops-brand" aria-label="Teaching Operations">P</div>
        <div className="ops-brand-copy"><strong>教学运营</strong><span>Teacher & Admin</span></div>
        <nav aria-label="管理菜单">
          {navigation.map((item) => (
            <button key={item.key} type="button" className={view === item.key ? "active" : ""} onClick={() => setView(item.key)}>
              <strong>{item.label}</strong><span>{item.description}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="ops-workspace">
        <header className="ops-header">
          <div><p>教学管理后台</p><h1>{navigation.find((item) => item.key === view)?.label}</h1></div>
          <div className="header-actions">
            {notice ? <span className={notice === "已保存" ? "notice success" : "notice error"}>{notice}</span> : null}
            <button className="icon-button" title="刷新数据" onClick={() => void load()} disabled={busy} type="button">↻</button>
          </div>
        </header>

        {view === "overview" ? <Overview data={data} setView={setView} /> : null}
        {view === "catalog" ? <Catalog data={data} run={act} busy={busy} /> : null}
        {view === "classes" ? <ClassPlanning data={data} run={act} busy={busy} selectedRunId={selectedRunId} setSelectedRunId={setSelectedRunId} /> : null}
        {view === "enrollment" ? <Enrollment data={data} run={act} busy={busy} /> : null}
        {view === "teaching" ? <Teaching data={data} run={act} busy={busy} selectedSessionId={selectedSessionId} setSelectedSessionId={setSelectedSessionId} /> : null}
        {view === "calendar" ? <Calendar data={data} /> : null}
        {view === "records" ? <Records data={data} run={act} busy={busy} /> : null}
      </section>
    </main>
  );
}

function Overview({ data, setView }: { data: PortalData; setView: (value: View) => void }) {
  const nextSessions = data.sessions.slice(0, 5);
  return <>
    <MetricStrip data={data} />
    <section className="ops-grid two-up">
      <Panel title="今日要处理">
        <div className="action-list">
          <button onClick={() => setView("classes")} type="button"><strong>规划班次与课节</strong><span>先开班，再排老师和教室</span></button>
          <button onClick={() => setView("enrollment")} type="button"><strong>处理报名与收费</strong><span>报名后自动生成课节预订与账单</span></button>
          <button onClick={() => setView("teaching")} type="button"><strong>进入上课点名</strong><span>只对已报名学生登记出勤</span></button>
          <button onClick={() => setView("calendar")} type="button"><strong>检查资源冲突</strong><span>教室与老师的时间占用</span></button>
        </div>
      </Panel>
      <Panel title="即将上课">
        <EntityTable columns={[["starts_at", "开始"], ["course_title", "课程"], ["run_name", "班次"], ["teacher_name", "老师"], ["classroom_name", "教室"]]} rows={nextSessions} emptyText="尚未排课" />
      </Panel>
    </section>
  </>;
}

function MetricStrip({ data }: { data: PortalData }) {
  const metrics = [
    ["开放班次", data.metrics.openRuns], ["未来 7 天课节", data.metrics.sessionsThisWeek], ["在读学生", data.metrics.activeStudents], ["待收款", money(data.metrics.outstanding)], ["资源冲突", data.metrics.conflicts],
  ];
  return <section className="metrics">{metrics.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</section>;
}

function Catalog({ data, run, busy }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run("createCourse", Object.fromEntries(form));
    event.currentTarget.reset();
  }
  return <section className="ops-stack">
    <Panel title="新建课程产品" subtitle="课程产品只定义教学与售价规则；不会直接占用老师、学生或教室。">
      <form className="entity-form five" onSubmit={submit}>
        <Field name="title" label="课程名称" placeholder="例如：English Year 7" required />
        <Field name="subject" label="学科" placeholder="例如：English" required />
        <Field name="level" label="适用级别" placeholder="例如：Year 7" required />
        <Field name="sessions" label="标准课节数" type="number" defaultValue="8" min="1" required />
        <Field name="minutes" label="每节分钟" type="number" defaultValue="90" min="30" required />
        <Field name="price" label="标准售价 (RM)" type="number" defaultValue="0" min="0" step="0.01" required />
        <button className="solid-button" disabled={busy} type="submit">新增课程</button>
      </form>
    </Panel>
    <Panel title="课程产品库" subtitle="修改售价或标准课时只影响之后开设的班次，不会改动已报名学生的合同金额。">
      <EntityTable columns={[["code", "编号"], ["title", "课程"], ["subject", "学科"], ["level", "级别"], ["default_sessions", "课节"], ["default_minutes", "分钟/节"], ["list_price", "标准售价"], ["run_count", "已开班次"], ["status", "状态"]]} rows={data.courses} moneyKeys={["list_price"]} emptyText="尚未建立课程产品" />
    </Panel>
  </section>;
}

function ClassPlanning({ data, run, busy, selectedRunId, setSelectedRunId }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean; selectedRunId: string; setSelectedRunId: (value: string) => void }) {
  const selectedRun = data.runs.find((item) => item.id === selectedRunId);
  const runSessions = data.sessions.filter((item) => item.class_run_id === selectedRunId);
  function classSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); void run("createClassRun", Object.fromEntries(form)); event.currentTarget.reset();
  }
  function sessionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); void run("createSession", Object.fromEntries(form)); event.currentTarget.reset();
  }
  return <section className="ops-stack">
    <Panel title="开设新班" subtitle="班次是报名、排课、人数容量和实际成交价的管理单位。">
      <form className="entity-form five" onSubmit={classSubmit}>
        <SelectField name="courseId" label="课程产品" items={data.courses} labelKey="title" required />
        <SelectField name="termId" label="学期" items={data.terms} labelKey="name" required />
        <Field name="name" label="班次名称" placeholder="例如：Saturday AM" required />
        <Field name="capacity" label="容量" type="number" defaultValue="16" min="1" required />
        <Field name="price" label="本班售价 (RM)" type="number" defaultValue="0" min="0" step="0.01" required />
        <button className="solid-button" disabled={busy} type="submit">开班</button>
      </form>
    </Panel>
    <Panel title="班次总览" subtitle="先选择一个班次，再为它加入具体课节。">
      <div className="selection-row">
        <label><span>当前班次</span><select value={selectedRunId} onChange={(event) => setSelectedRunId(event.target.value)}>{data.runs.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        {selectedRun ? <div className="run-summary"><strong>{selectedRun.course_title}</strong><span>{selectedRun.term_name} · {selectedRun.student_count}/{selectedRun.capacity} 学生 · {money(selectedRun.price)}</span></div> : null}
      </div>
      <EntityTable columns={[["code", "班次编号"], ["course_title", "课程"], ["name", "班次"], ["term_name", "学期"], ["student_count", "已报名"], ["capacity", "容量"], ["session_count", "已排课节"], ["price", "本班售价"], ["status", "状态"]]} rows={data.runs} moneyKeys={["price"]} emptyText="尚未开班" />
    </Panel>
    <Panel title="新增课节" subtitle="提交前系统会检查教室与老师在相同时间是否已经被预订。">
      <form className="entity-form six" onSubmit={sessionSubmit}>
        <SelectField name="runId" label="班次" items={data.runs} labelKey="name" value={selectedRunId} onChange={setSelectedRunId} required />
        <Field name="topic" label="本节主题" placeholder="例如：Unit 1 review" required />
        <Field name="startsAt" label="开始时间" type="datetime-local" required />
        <Field name="endsAt" label="结束时间" type="datetime-local" required />
        <SelectField name="classroomId" label="教室" items={data.classrooms} labelKey="name" required />
        <SelectField name="teacherId" label="老师" items={data.teachers} labelKey="name" required />
        <Field name="payAmount" label="本节老师报酬 (RM)" type="number" defaultValue="0" min="0" step="0.01" required />
        <button className="solid-button" disabled={busy || !selectedRunId} type="submit">加入课节</button>
      </form>
      <EntityTable columns={[["session_no", "节次"], ["topic", "主题"], ["starts_at", "开始"], ["ends_at", "结束"], ["teacher_name", "老师"], ["classroom_name", "教室"], ["pay_amount", "老师报酬"], ["pay_status", "报酬状态"], ["status", "课节状态"]]} rows={runSessions} moneyKeys={["pay_amount"]} emptyText="这个班次尚未排课" />
    </Panel>
  </section>;
}

function Enrollment({ data, run, busy }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean }) {
  function enroll(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); void run("enrollStudent", Object.fromEntries(form)); event.currentTarget.reset(); }
  return <section className="ops-stack">
    <Panel title="帮助学生报名" subtitle="报名保存后，系统会按班次的已排课节生成学生预订、分摊费用和一张账单。">
      <form className="entity-form three" onSubmit={enroll}>
        <SelectField name="runId" label="选择班次" items={data.runs.filter((item) => item.status === "open")} labelKey="name" required />
        <SelectField name="studentId" label="选择学生" items={data.students.filter((item) => item.status === "active")} labelKey="name" required />
        <button className="solid-button" disabled={busy} type="submit">确认报名</button>
      </form>
    </Panel>
    <Panel title="报名与账单" subtitle="收费状态来自账单与实际收款，不允许在表格中直接改写。">
      <EntityTable columns={[["student_name", "学生"], ["course_title", "课程"], ["run_name", "班次"], ["contracted_fee", "合同金额"], ["invoice_no", "账单"], ["paid_amount", "已收"], ["invoice_status", "账单状态"], ["status", "报名状态"]]} rows={data.enrollments} moneyKeys={["contracted_fee", "paid_amount"]} emptyText="尚未有报名记录" />
    </Panel>
    <Panel title="收款" subtitle="每一笔收款都会留下交易记录，并更新对应账单余额。">
      <InvoiceTable invoices={data.invoices} onPay={(invoice) => void run("recordPayment", { invoiceId: invoice.id, amount: Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount)) })} busy={busy} />
    </Panel>
  </section>;
}

function Teaching({ data, run, busy, selectedSessionId, setSelectedSessionId }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean; selectedSessionId: string; setSelectedSessionId: (value: string) => void }) {
  const session = data.sessions.find((item) => item.id === selectedSessionId);
  const roster = data.attendance.filter((item) => item.class_session_id === selectedSessionId);
  return <section className="ops-grid teaching-layout">
    <Panel title="选择课节">
      <div className="session-list">
        {data.sessions.map((item) => <button type="button" key={item.id} onClick={() => setSelectedSessionId(item.id)} className={item.id === selectedSessionId ? "active" : ""}><strong>{item.course_title}</strong><span>{item.topic}</span><em>{item.starts_at}</em></button>)}
      </div>
    </Panel>
    <Panel title="上课点名" subtitle="名单只来自已报名且已生成学生课节预订的记录。">
      {session ? <div className="lesson-summary"><strong>{session.course_title} · {session.run_name}</strong><span>{session.topic} · {session.starts_at} · {session.classroom_name} · {session.teacher_name}</span></div> : null}
      <div className="attendance-list">
        {roster.map((item) => <div className="attendance-row" key={item.id}><div><strong>{item.student_name}</strong><span>本节费用 {money(item.allocated_fee)}</span></div><Status status={item.status} /><div className="attendance-actions"><button disabled={busy} onClick={() => void run("setAttendance", { studentBookingId: item.student_booking_id, attendanceStatus: "present" })} type="button">出席</button><button disabled={busy} onClick={() => void run("setAttendance", { studentBookingId: item.student_booking_id, attendanceStatus: "late" })} type="button">迟到</button><button disabled={busy} onClick={() => void run("setAttendance", { studentBookingId: item.student_booking_id, attendanceStatus: "leave" })} type="button">请假</button><button disabled={busy} onClick={() => void run("setAttendance", { studentBookingId: item.student_booking_id, attendanceStatus: "absent" })} type="button">缺勤</button></div></div>)}
        {!roster.length ? <p className="empty-state">本节没有已报名学生。</p> : null}
      </div>
    </Panel>
  </section>;
}

function Calendar({ data }: { data: PortalData }) {
  return <section className="ops-stack">
    <Panel title="教室资源日历" subtitle="每一行都是从课节产生的教室预订，教室本身只是可被占用的资源。">
      <EntityTable columns={[["starts_at", "开始"], ["ends_at", "结束"], ["classroom_name", "教室"], ["course_title", "课程"], ["run_name", "班次"], ["topic", "课节主题"], ["status", "预订状态"]]} rows={data.resourceBookings} emptyText="没有教室预订" />
    </Panel>
    <Panel title="老师预订与薪酬">
      <EntityTable columns={[["starts_at", "开始"], ["ends_at", "结束"], ["teacher_name", "老师"], ["course_title", "课程"], ["run_name", "班次"], ["topic", "课节"], ["pay_amount", "本节报酬"], ["pay_status", "付款状态"]]} rows={data.teacherBookings} moneyKeys={["pay_amount"]} emptyText="没有老师预订" />
    </Panel>
    <Panel title="冲突提醒">
      <EntityTable columns={[["kind", "类型"], ["resource", "资源"], ["first", "第一项"], ["second", "第二项"], ["starts_at", "冲突开始"]]} rows={data.conflicts} emptyText="当前没有资源冲突" />
    </Panel>
  </section>;
}

function Records({ data, run, busy }: { data: PortalData; run: (action: string, values?: Row) => Promise<void>; busy: boolean }) {
  function submit(action: string) { return (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(action, Object.fromEntries(form)); event.currentTarget.reset(); }; }
  return <section className="ops-stack">
    <Panel title="学生" subtitle="学生资料是报名与课节预订的唯一来源。">
      <form className="entity-form four" onSubmit={submit("createStudent")}><Field name="name" label="学生姓名" required /><Field name="level" label="年级" required /><Field name="phone" label="家长电话" /><button className="solid-button" type="submit" disabled={busy}>新增学生</button></form>
      <EntityTable columns={[["code", "编号"], ["name", "姓名"], ["level", "年级"], ["guardian_phone", "家长电话"], ["status", "状态"]]} rows={data.students} emptyText="尚无学生" />
    </Panel>
    <Panel title="老师" subtitle="老师资料用于创建老师预订与计算每节课的报酬。">
      <form className="entity-form four" onSubmit={submit("createTeacher")}><Field name="name" label="老师姓名" required /><Field name="subject" label="擅长学科" required /><Field name="phone" label="电话" /><button className="solid-button" type="submit" disabled={busy}>新增老师</button></form>
      <EntityTable columns={[["code", "编号"], ["name", "姓名"], ["subject", "学科"], ["phone", "电话"], ["status", "状态"]]} rows={data.teachers} emptyText="尚无老师" />
    </Panel>
    <Panel title="教室" subtitle="教室不保存学生或课程资料，只作为课节可预订的资源。">
      <form className="entity-form four" onSubmit={submit("createClassroom")}><Field name="name" label="教室名称" required /><Field name="location" label="位置" required /><Field name="capacity" label="容量" type="number" defaultValue="12" min="1" required /><button className="solid-button" type="submit" disabled={busy}>新增教室</button></form>
      <EntityTable columns={[["code", "编号"], ["name", "教室"], ["location", "位置"], ["capacity", "容量"], ["status", "状态"]]} rows={data.classrooms} emptyText="尚无教室" />
    </Panel>
  </section>;
}

function InvoiceTable({ invoices, onPay, busy }: { invoices: Row[]; onPay: (invoice: Row) => void; busy: boolean }) {
  return <div className="table-wrap"><table className="entity-table"><thead><tr><th>账单号</th><th>学生</th><th>课程</th><th>班次</th><th>应收</th><th>已收</th><th>余额</th><th>状态</th><th aria-label="操作" /></tr></thead><tbody>{invoices.map((item) => { const remaining = Math.max(0, Number(item.total_amount) - Number(item.paid_amount)); return <tr key={item.id}><td>{item.invoice_no}</td><td>{item.student_name}</td><td>{item.course_title}</td><td>{item.run_name}</td><td>{money(item.total_amount)}</td><td>{money(item.paid_amount)}</td><td>{money(remaining)}</td><td><Status status={item.status} /></td><td>{remaining > 0 ? <button className="table-action" disabled={busy} onClick={() => onPay(item)} type="button">收清余额</button> : null}</td></tr>; })}{!invoices.length ? <tr><td colSpan={9} className="empty-cell">尚未生成账单</td></tr> : null}</tbody></table></div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="ops-panel"><div className="panel-heading"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div></div>{children}</section>;
}

function EntityTable({ columns, rows, moneyKeys = [], emptyText }: { columns: [string, string][]; rows: Row[]; moneyKeys?: string[]; emptyText: string }) {
  return <div className="table-wrap"><table className="entity-table"><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={item.id}>{columns.map(([key]) => <td key={key}>{key.includes("status") ? <Status status={String(item[key] ?? "")} /> : moneyKeys.includes(key) ? money(item[key]) : String(item[key] ?? "-")}</td>)}</tr>)}{!rows.length ? <tr><td className="empty-cell" colSpan={columns.length}>{emptyText}</td></tr> : null}</tbody></table></div>;
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <label className="field"><span>{label}</span><input {...props} /></label>; }
function SelectField({ label, items, labelKey, value, onChange, ...props }: { label: string; items: Row[]; labelKey: string; value?: string; onChange?: (value: string) => void } & React.SelectHTMLAttributes<HTMLSelectElement>) { return <label className="field"><span>{label}</span><select {...props} value={value} onChange={(event) => onChange?.(event.target.value)}>{!items.length ? <option value="">暂无可选资料</option> : null}{items.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item[labelKey] ?? "")}{item.code ? ` · ${String(item.code)}` : ""}</option>)}</select></label>; }
function Status({ status }: { status: string }) { return <span className={`status status-${status}`}>{status || "-"}</span>; }
