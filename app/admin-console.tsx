"use client";

import { useMemo, useState } from "react";

type TableKey = "courses" | "classrooms" | "students" | "teachers";
type Row = Record<string, string>;

type TableConfig = {
  key: TableKey;
  title: string;
  subtitle: string;
  columns: string[];
  createRow: (nextNo: number) => Row;
};

const initialRows: Record<TableKey, Row[]> = {
  courses: [
    {
      "课程编号": "CRS-001",
      "课程名称": "语文 Year 7",
      "级别": "Year 7",
      "总课节": "12",
      "默认课堂": "A-201",
      "价格": "RM 300",
      "状态": "进行中",
    },
    {
      "课程编号": "CRS-002",
      "课程名称": "数学 Year 7",
      "级别": "Year 7",
      "总课节": "8",
      "默认课堂": "B-102",
      "价格": "RM 300",
      "状态": "开放报名",
    },
    {
      "课程编号": "CRS-003",
      "课程名称": "小提琴 Beginner",
      "级别": "Beginner",
      "总课节": "8",
      "默认课堂": "M-301",
      "价格": "RM 450",
      "状态": "进行中",
    },
  ],
  classrooms: [
    {
      "课堂编号": "CLS-001",
      "课程": "语文 Year 7",
      "课节": "第 1 节",
      "日期时间": "2026-07-18 09:00",
      "教室": "A-201",
      "老师 Booking": "张老师",
      "学生 Booking": "Allen, May, Jerry, Lina",
      "状态": "已排课",
    },
    {
      "课堂编号": "CLS-002",
      "课程": "语文 Year 7",
      "课节": "第 2 节",
      "日期时间": "2026-07-25 09:00",
      "教室": "A-201",
      "老师 Booking": "张老师",
      "学生 Booking": "Allen, May, Jerry, Lina",
      "状态": "已排课",
    },
    {
      "课堂编号": "CLS-003",
      "课程": "数学 Year 7",
      "课节": "第 1 节",
      "日期时间": "2026-07-18 10:30",
      "教室": "B-102",
      "老师 Booking": "Ms Sophia",
      "学生 Booking": "Allen, Nora",
      "状态": "已排课",
    },
    {
      "课堂编号": "CLS-004",
      "课程": "小提琴 Beginner",
      "课节": "第 1 节",
      "日期时间": "2026-07-22 18:00",
      "教室": "M-301",
      "老师 Booking": "Lim 老师",
      "学生 Booking": "May, Lina",
      "状态": "已排课",
    },
  ],
  students: [
    {
      "学生编号": "STU-001",
      "学生姓名": "Allen Tan",
      "年级": "Year 7",
      "家长电话": "012-2233445",
      "报名课程": "语文 Year 7, 数学 Year 7",
      "课堂 Booking": "CLS-001, CLS-002, CLS-003",
      "付款状态": "已付款",
      "状态": "正常",
    },
    {
      "学生编号": "STU-002",
      "学生姓名": "May Lee",
      "年级": "Year 7",
      "家长电话": "017-9988776",
      "报名课程": "语文 Year 7, 小提琴 Beginner",
      "课堂 Booking": "CLS-001, CLS-002, CLS-004",
      "付款状态": "已付款",
      "状态": "正常",
    },
    {
      "学生编号": "STU-003",
      "学生姓名": "Jerry Baker",
      "年级": "Year 7",
      "家长电话": "013-4545454",
      "报名课程": "语文 Year 7",
      "课堂 Booking": "CLS-001, CLS-002",
      "付款状态": "待付款",
      "状态": "正常",
    },
    {
      "学生编号": "STU-004",
      "学生姓名": "Lina Wong",
      "年级": "Year 6",
      "家长电话": "011-3344556",
      "报名课程": "语文 Year 7, 小提琴 Beginner",
      "课堂 Booking": "CLS-001, CLS-002, CLS-004",
      "付款状态": "已付款",
      "状态": "正常",
    },
  ],
  teachers: [
    {
      "老师编号": "TCH-001",
      "老师姓名": "张老师",
      "科目": "语文",
      "电话": "012-8888999",
      "负责课程": "语文 Year 7",
      "课堂 Booking": "CLS-001, CLS-002",
      "状态": "可排课",
    },
    {
      "老师编号": "TCH-002",
      "老师姓名": "Ms Sophia",
      "科目": "数学",
      "电话": "013-1111222",
      "负责课程": "数学 Year 7",
      "课堂 Booking": "CLS-003",
      "状态": "可排课",
    },
    {
      "老师编号": "TCH-003",
      "老师姓名": "Lim 老师",
      "科目": "小提琴",
      "电话": "016-3333666",
      "负责课程": "小提琴 Beginner",
      "课堂 Booking": "CLS-004",
      "状态": "可排课",
    },
  ],
};

const tables: TableConfig[] = [
  {
    key: "courses",
    title: "课程",
    subtitle: "课程是核心资料，课堂会从课程生成具体课节。",
    columns: ["课程编号", "课程名称", "级别", "总课节", "默认课堂", "价格", "状态"],
    createRow: (nextNo) => ({
      "课程编号": `CRS-${String(nextNo).padStart(3, "0")}`,
      "课程名称": "新课程",
      "级别": "Year 7",
      "总课节": "8",
      "默认课堂": "待安排",
      "价格": "RM 0",
      "状态": "草稿",
    }),
  },
  {
    key: "classrooms",
    title: "课堂",
    subtitle: "课堂是一节具体课，包含教室、老师 Booking、学生 Booking。",
    columns: ["课堂编号", "课程", "课节", "日期时间", "教室", "老师 Booking", "学生 Booking", "状态"],
    createRow: (nextNo) => ({
      "课堂编号": `CLS-${String(nextNo).padStart(3, "0")}`,
      "课程": "待选择课程",
      "课节": "第 1 节",
      "日期时间": "待安排",
      "教室": "待安排",
      "老师 Booking": "待安排",
      "学生 Booking": "待安排",
      "状态": "草稿",
    }),
  },
  {
    key: "students",
    title: "学生",
    subtitle: "学生资料保留报名课程和已 booking 的课堂。",
    columns: ["学生编号", "学生姓名", "年级", "家长电话", "报名课程", "课堂 Booking", "付款状态", "状态"],
    createRow: (nextNo) => ({
      "学生编号": `STU-${String(nextNo).padStart(3, "0")}`,
      "学生姓名": "新学生",
      "年级": "Year 7",
      "家长电话": "-",
      "报名课程": "待报名",
      "课堂 Booking": "无",
      "付款状态": "未付款",
      "状态": "正常",
    }),
  },
  {
    key: "teachers",
    title: "老师",
    subtitle: "老师资料保留负责课程和已 booking 的课堂。",
    columns: ["老师编号", "老师姓名", "科目", "电话", "负责课程", "课堂 Booking", "状态"],
    createRow: (nextNo) => ({
      "老师编号": `TCH-${String(nextNo).padStart(3, "0")}`,
      "老师姓名": "新老师",
      "科目": "待设置",
      "电话": "-",
      "负责课程": "待安排",
      "课堂 Booking": "无",
      "状态": "可排课",
    }),
  },
];

export function AdminConsole() {
  const [rows, setRows] = useState(initialRows);
  const totals = useMemo(
    () => ({
      courses: rows.courses.length,
      classrooms: rows.classrooms.length,
      students: rows.students.length,
      teachers: rows.teachers.length,
    }),
    [rows],
  );

  function addRow(table: TableConfig) {
    setRows((current) => ({
      ...current,
      [table.key]: [...current[table.key], table.createRow(current[table.key].length + 1)],
    }));
  }

  return (
    <main className="admin-page">
      <header className="page-header">
        <div>
          <p>教学管理后台</p>
          <h1>基础数据表格</h1>
        </div>
        <div className="summary-bar">
          <span>课程 {totals.courses}</span>
          <span>课堂 {totals.classrooms}</span>
          <span>学生 {totals.students}</span>
          <span>老师 {totals.teachers}</span>
        </div>
      </header>

      <section className="table-stack" aria-label="基础数据表格">
        {tables.map((table) => (
          <DataGrid key={table.key} rows={rows[table.key]} table={table} onCreate={() => addRow(table)} />
        ))}
      </section>
    </main>
  );
}

function DataGrid({
  table,
  rows,
  onCreate,
}: {
  table: TableConfig;
  rows: Row[];
  onCreate: () => void;
}) {
  return (
    <section className="grid-card">
      <div className="grid-card-header">
        <div>
          <h2>{table.title}</h2>
          <p>{table.subtitle}</p>
        </div>
        <button onClick={onCreate} type="button">
          新增{table.title}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${table.key}-${rowIndex}`}>
                {table.columns.map((column) => (
                  <td key={column}>
                    <span className={column.includes("状态") ? "status-cell" : ""}>{row[column]}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
