"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type TableKey = "courses" | "sessions" | "classrooms" | "students" | "teachers" | "bookings";
type Row = Record<string, string | number | null>;
type SortState = { column: string; direction: "asc" | "desc" };

const tableLabels: Record<TableKey, string> = {
  courses: "课程",
  sessions: "课节",
  classrooms: "课堂资源",
  students: "学生",
  teachers: "老师",
  bookings: "Booking",
};

const tableDescriptions: Record<TableKey, string> = {
  courses: "课程是可售卖的教学产品，可以预先生成课节和占用资源。",
  sessions: "课节是课程下面的一次具体上课计划。",
  classrooms: "课堂资源只是房间或空间，不承载学生老师数据。",
  students: "学生基础资料，后续通过报名和 student booking 进入课节。",
  teachers: "老师基础资料，后续通过 teacher booking 占用老师时间。",
  bookings: "Booking 是核心占用层，统一查看教室、老师、学生被哪节课占用。",
};

const tableColumns: Record<TableKey, string[]> = {
  courses: ["code", "name", "level", "total_sessions", "price", "status", "created_at"],
  sessions: ["course", "session_no", "title", "starts_at", "ends_at", "status"],
  classrooms: ["code", "name", "location", "capacity", "status", "created_at"],
  students: ["code", "name", "level", "guardian_phone", "status", "created_at"],
  teachers: ["code", "name", "subject", "phone", "status", "created_at"],
  bookings: ["booking_type", "course", "session", "target", "starts_at", "ends_at", "status"],
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
  location: "位置",
  capacity: "容量",
  guardian_phone: "家长电话",
  subject: "科目",
  phone: "电话",
  booking_type: "Booking 类型",
  session: "课节",
  target: "占用对象",
};

const navItems: TableKey[] = ["courses", "sessions", "classrooms", "students", "teachers", "bookings"];

export function AdminConsole({ activeTable }: { activeTable: TableKey }) {
  const [data, setData] = useState<Record<TableKey, Row[]>>({
    courses: [],
    sessions: [],
    classrooms: [],
    students: [],
    teachers: [],
    bookings: [],
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortState>({ column: tableColumns[activeTable][0], direction: "asc" });
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  const columns = tableColumns[activeTable];

  useEffect(() => {
    setSort({ column: tableColumns[activeTable][0], direction: "asc" });
    setFilter("");
    setVisibleColumns(Object.fromEntries(tableColumns[activeTable].map((column) => [column, true])));
    setMenuOpen(false);
  }, [activeTable]);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      const response = await fetch("/api/admin-data", { cache: "no-store" });
      const payload = (await response.json()) as Record<TableKey, Row[]> & { error?: string };
      if (mounted && !payload.error) {
        setData({
          courses: payload.courses ?? [],
          sessions: payload.sessions ?? [],
          classrooms: payload.classrooms ?? [],
          students: payload.students ?? [],
          teachers: payload.teachers ?? [],
          bookings: payload.bookings ?? [],
        });
      }
      setLoading(false);
    }
    loadData().catch(() => setLoading(false));
    return () => {
      mounted = false;
    };
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
    const response = await fetch("/api/admin-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: activeTable }),
    });
    const payload = (await response.json()) as Record<TableKey, Row[]>;
    setData({
      courses: payload.courses ?? [],
      sessions: payload.sessions ?? [],
      classrooms: payload.classrooms ?? [],
      students: payload.students ?? [],
      teachers: payload.teachers ?? [],
      bookings: payload.bookings ?? [],
    });
    setLoading(false);
  }

  return (
    <main className="admin-layout">
      <aside className="side-nav" aria-label="模块导航">
        <div className="brand">P</div>
        <nav>
          {navItems.map((item) => (
            <Link className={item === activeTable ? "active" : ""} href={`/${item}`} key={item}>
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
                        <span className={column === "status" ? "status-cell" : ""}>{String(row[column] ?? "")}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="table-footer">
            {loading ? "读取中" : `共 ${rows.length} 条`}
          </footer>
        </section>
      </section>
    </main>
  );
}
