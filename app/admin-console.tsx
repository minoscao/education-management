"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type TableKey =
  | "courses"
  | "sessions"
  | "classrooms"
  | "students"
  | "teachers"
  | "teacherBookings"
  | "studentBookings";

type Row = Record<string, string | number | null>;
type SortState = { column: string; direction: "asc" | "desc" };
type EditingCell = { rowId: string; column: string; value: string } | null;

const tableLabels: Record<TableKey, string> = {
  courses: "课程",
  sessions: "课节",
  classrooms: "课堂资源",
  students: "学生",
  teachers: "老师",
  teacherBookings: "老师 Booking",
  studentBookings: "学生 Booking",
};

const tableDescriptions: Record<TableKey, string> = {
  courses: "课程是可售卖的教学产品，可以预先生成课节和占用资源。",
  sessions: "课节是课程下面的一次具体上课计划，教室资源通过资源占用锁定。",
  classrooms: "课堂资源只是房间或空间，不承载学生老师数据。",
  students: "学生基础资料，后续通过报名和学生 Booking 进入课节。",
  teachers: "老师基础资料，后续通过老师 Booking 占用老师时间。",
  teacherBookings: "老师 Booking 记录老师被哪一节课占用，以及对应报酬。",
  studentBookings: "学生 Booking 记录学生被安排到哪一节课，以及课程费用平摊到该课节的金额。",
};

const tableColumns: Record<TableKey, string[]> = {
  courses: ["code", "name", "level", "total_sessions", "price", "status", "created_at"],
  sessions: ["course", "session_no", "title", "starts_at", "ends_at", "classroom", "status"],
  classrooms: ["code", "name", "location", "capacity", "status", "created_at"],
  students: ["code", "name", "level", "guardian_phone", "status", "created_at"],
  teachers: ["code", "name", "subject", "phone", "status", "created_at"],
  teacherBookings: ["course", "session", "teacher", "starts_at", "ends_at", "compensation_amount", "compensation_status", "status"],
  studentBookings: ["course", "session", "student", "starts_at", "ends_at", "fee_amount", "payment_status", "status"],
};

const editableColumns: Record<TableKey, Set<string>> = {
  courses: new Set(["code", "name", "level", "total_sessions", "price", "status"]),
  sessions: new Set(["session_no", "title", "starts_at", "ends_at", "status"]),
  classrooms: new Set(["code", "name", "location", "capacity", "status"]),
  students: new Set(["code", "name", "level", "guardian_phone", "status"]),
  teachers: new Set(["code", "name", "subject", "phone", "status"]),
  teacherBookings: new Set(["compensation_amount", "compensation_status", "status"]),
  studentBookings: new Set(["fee_amount", "payment_status", "status"]),
};

const columnLabels: Record<string, string> = {
  code: "编号",
  name: "名称",
  level: "级别",
  total_sessions: "总课节",
  price: "价格",
  status: "状态",
  created_at: "创建时间",
  course: "课程",
  session_no: "第几节",
  title: "标题",
  starts_at: "开始时间",
  ends_at: "结束时间",
  classroom: "课堂资源",
  location: "位置",
  capacity: "容量",
  guardian_phone: "家长电话",
  subject: "科目",
  phone: "电话",
  session: "课节",
  teacher: "老师",
  student: "学生",
  compensation_amount: "老师报酬",
  compensation_status: "报酬状态",
  fee_amount: "课节费用",
  payment_status: "付款状态",
};

const routeByTable: Record<TableKey, string> = {
  courses: "/courses",
  sessions: "/sessions",
  classrooms: "/classrooms",
  students: "/students",
  teachers: "/teachers",
  teacherBookings: "/teacher-bookings",
  studentBookings: "/student-bookings",
};

const navItems: TableKey[] = [
  "courses",
  "sessions",
  "classrooms",
  "students",
  "teachers",
  "teacherBookings",
  "studentBookings",
];

const emptyData: Record<TableKey, Row[]> = {
  courses: [],
  sessions: [],
  classrooms: [],
  students: [],
  teachers: [],
  teacherBookings: [],
  studentBookings: [],
};

export function AdminConsole({ activeTable }: { activeTable: TableKey }) {
  const [data, setData] = useState<Record<TableKey, Row[]>>(emptyData);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortState>({ column: tableColumns[activeTable][0], direction: "asc" });
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const columns = tableColumns[activeTable];

  useEffect(() => {
    setSort({ column: tableColumns[activeTable][0], direction: "asc" });
    setFilter("");
    setVisibleColumns(Object.fromEntries(tableColumns[activeTable].map((column) => [column, true])));
    setMenuOpen(false);
    setEditingCell(null);
  }, [activeTable]);

  async function loadData() {
    setLoading(true);
    const response = await fetch("/api/admin-data", { cache: "no-store" });
    const payload = (await response.json()) as Partial<Record<TableKey, Row[]>> & { error?: string };
    if (!payload.error) {
      setData({
        courses: payload.courses ?? [],
        sessions: payload.sessions ?? [],
        classrooms: payload.classrooms ?? [],
        students: payload.students ?? [],
        teachers: payload.teachers ?? [],
        teacherBookings: payload.teacherBookings ?? [],
        studentBookings: payload.studentBookings ?? [],
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, []);

  const visible = columns.filter((column) => visibleColumns[column] !== false);

  const rows = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const filtered = data[activeTable].filter((row) => {
      if (!term) return true;
      return columns.some((column) => String(row[column] ?? "").toLowerCase().includes(term));
    });

    return [...filtered].sort((a, b) => {
      const left = String(a[sort.column] ?? "");
      const right = String(b[sort.column] ?? "");
      const result = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? result : -result;
    });
  }, [activeTable, columns, data, filter, sort]);

  function toggleSort(column: string) {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
    }));
  }

  async function createRow() {
    setLoading(true);
    await fetch("/api/admin-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: activeTable }),
    });
    await loadData();
  }

  async function saveCell() {
    if (!editingCell) return;
    const cellKey = `${editingCell.rowId}-${editingCell.column}`;
    setSavingCell(cellKey);
    const response = await fetch("/api/admin-data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: activeTable,
        id: editingCell.rowId,
        column: editingCell.column,
        value: editingCell.value,
      }),
    });
    const payload = (await response.json()) as Partial<Record<TableKey, Row[]>> & { error?: string };
    if (!payload.error) {
      setData({
        courses: payload.courses ?? [],
        sessions: payload.sessions ?? [],
        classrooms: payload.classrooms ?? [],
        students: payload.students ?? [],
        teachers: payload.teachers ?? [],
        teacherBookings: payload.teacherBookings ?? [],
        studentBookings: payload.studentBookings ?? [],
      });
    }
    setEditingCell(null);
    setSavingCell(null);
  }

  function startEdit(row: Row, column: string) {
    if (!editableColumns[activeTable].has(column)) return;
    setEditingCell({
      rowId: String(row.id),
      column,
      value: String(row[column] ?? ""),
    });
  }

  return (
    <main className="admin-layout">
      <aside className="side-nav" aria-label="模块导航">
        <div className="brand">P</div>
        <nav>
          {navItems.map((item) => (
            <Link className={item === activeTable ? "active" : ""} href={routeByTable[item]} key={item}>
              {tableLabels[item]}
              <span>{data[item].length}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="page-header">
          <div>
            <p>教学管理后台</p>
            <h1>{tableLabels[activeTable]}</h1>
            <span>{tableDescriptions[activeTable]}</span>
          </div>
          <button className="primary-action" disabled={loading} onClick={createRow} type="button">
            新增{tableLabels[activeTable]}
          </button>
        </header>

        <section className="table-card">
          <div className="table-toolbar">
            <label>
              <span>筛选</span>
              <input onChange={(event) => setFilter(event.target.value)} placeholder="输入关键词" value={filter} />
            </label>
            <div className="column-menu">
              <button onClick={() => setMenuOpen((open) => !open)} type="button">
                显示列
              </button>
              {menuOpen ? (
                <div className="column-popover">
                  {columns.map((column) => (
                    <label key={column}>
                      <input
                        checked={visibleColumns[column] !== false}
                        onChange={() =>
                          setVisibleColumns((current) => ({
                            ...current,
                            [column]: current[column] === false,
                          }))
                        }
                        type="checkbox"
                      />
                      {columnLabels[column] ?? column}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {visible.map((column) => (
                    <th key={column}>
                      <button onClick={() => toggleSort(column)} type="button">
                        {columnLabels[column] ?? column}
                        {sort.column === column ? <span>{sort.direction === "asc" ? "↑" : "↓"}</span> : null}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={String(row.id ?? index)}>
                    {visible.map((column) => (
                      <td key={column}>
                        {editingCell?.rowId === String(row.id) && editingCell.column === column ? (
                          <input
                            autoFocus
                            className="cell-input"
                            onBlur={saveCell}
                            onChange={(event) =>
                              setEditingCell((current) =>
                                current ? { ...current, value: event.target.value } : current,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                saveCell();
                              }
                              if (event.key === "Escape") {
                                setEditingCell(null);
                              }
                            }}
                            value={editingCell.value}
                          />
                        ) : (
                          editableColumns[activeTable].has(column) ? (
                            <button
                              className={column.includes("status") ? "editable-cell status-cell" : "editable-cell"}
                              disabled={savingCell === `${String(row.id)}-${column}`}
                              onClick={() => startEdit(row, column)}
                              type="button"
                            >
                              {savingCell === `${String(row.id)}-${column}` ? "保存中" : String(row[column] ?? "")}
                            </button>
                          ) : (
                            <span className={column.includes("status") ? "readonly-cell status-cell" : "readonly-cell"}>
                              {String(row[column] ?? "")}
                            </span>
                          )
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="table-footer">{loading ? "读取中" : `共 ${rows.length} 条`}</footer>
        </section>
      </section>
    </main>
  );
}
