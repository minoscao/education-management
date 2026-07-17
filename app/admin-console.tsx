"use client";

import { useMemo, useState } from "react";

type EntityType = "courses" | "rooms" | "students" | "teachers";
type StatusTone = "open" | "started" | "finished" | "inactive";

type EntityRef = {
  type: EntityType;
  id: string;
  label: string;
  meta?: string;
};

type Field = {
  label: string;
  value: string;
};

type Entity = {
  id: string;
  type: EntityType;
  name: string;
  subtitle: string;
  status: StatusTone;
  stats: Field[];
  fields: Field[];
  relations: {
    label: string;
    items: EntityRef[];
  }[];
  note?: string;
};

const statusText: Record<StatusTone, string> = {
  open: "开放报名",
  started: "进行中",
  finished: "已完成",
  inactive: "停用",
};

const statusClass: Record<StatusTone, string> = {
  open: "is-open",
  started: "is-started",
  finished: "is-finished",
  inactive: "is-inactive",
};

const modules: {
  type: EntityType;
  title: string;
  description: string;
}[] = [
  { type: "courses", title: "课程管理", description: "课程、班级、老师、学生" },
  { type: "rooms", title: "教室管理", description: "教室容量、地点、课表" },
  { type: "students", title: "学生管理", description: "学生资料、报名、出勤" },
  { type: "teachers", title: "老师管理", description: "老师资料、课程、学生" },
];

const data: Record<EntityType, Entity[]> = {
  courses: [
    {
      id: "course-chinese-y7",
      type: "courses",
      name: "语文 Year 7 Sun",
      subtitle: "每周六 09:00 · 12 节课",
      status: "started",
      stats: [
        { label: "学生", value: "12" },
        { label: "已完成", value: "3/12" },
        { label: "收入", value: "RM 3,600" },
      ],
      fields: [
        { label: "课程编号", value: "CN-Y7-SUN" },
        { label: "等级", value: "Year 7" },
        { label: "费用", value: "RM 300" },
        { label: "默认教室", value: "A-201" },
      ],
      relations: [
        {
          label: "授课老师",
          items: [{ type: "teachers", id: "teacher-zhang", label: "张老师", meta: "Senior Teacher" }],
        },
        {
          label: "上课教室",
          items: [{ type: "rooms", id: "room-a201", label: "A-201", meta: "20 人容量" }],
        },
        {
          label: "已报名学生",
          items: [
            { type: "students", id: "student-allen", label: "Allen Tan", meta: "已付款" },
            { type: "students", id: "student-may", label: "May Lee", meta: "已付款" },
            { type: "students", id: "student-jerry", label: "Jerry Baker", meta: "待付款" },
            { type: "students", id: "student-lina", label: "Lina Wong", meta: "已付款" },
          ],
        },
      ],
      note: "这里未来会接课程表、课节、教材、出勤和订单。",
    },
    {
      id: "course-math-y7",
      type: "courses",
      name: "数学 Year 7 Sat",
      subtitle: "每周六 10:30 · 8 节课",
      status: "open",
      stats: [
        { label: "学生", value: "8" },
        { label: "已完成", value: "2/8" },
        { label: "收入", value: "RM 2,400" },
      ],
      fields: [
        { label: "课程编号", value: "MA-Y7-SAT" },
        { label: "等级", value: "Year 7" },
        { label: "费用", value: "RM 300" },
        { label: "默认教室", value: "B-102" },
      ],
      relations: [
        {
          label: "授课老师",
          items: [{ type: "teachers", id: "teacher-sophia", label: "Ms Sophia", meta: "Math Teacher" }],
        },
        {
          label: "上课教室",
          items: [{ type: "rooms", id: "room-b102", label: "B-102", meta: "16 人容量" }],
        },
        {
          label: "已报名学生",
          items: [
            { type: "students", id: "student-allen", label: "Allen Tan", meta: "已付款" },
            { type: "students", id: "student-jerry", label: "Jerry Baker", meta: "已退款" },
            { type: "students", id: "student-nora", label: "Nora Lim", meta: "已付款" },
          ],
        },
      ],
    },
    {
      id: "course-violin-beginner",
      type: "courses",
      name: "小提琴 Beginner",
      subtitle: "每周三 18:00 · 8 节课",
      status: "started",
      stats: [
        { label: "学生", value: "6" },
        { label: "已完成", value: "2/8" },
        { label: "收入", value: "RM 2,700" },
      ],
      fields: [
        { label: "课程编号", value: "VI-BEG-WED" },
        { label: "等级", value: "Beginner" },
        { label: "费用", value: "RM 450" },
        { label: "默认教室", value: "M-301" },
      ],
      relations: [
        {
          label: "授课老师",
          items: [{ type: "teachers", id: "teacher-lim", label: "Lim 老师", meta: "Music Teacher" }],
        },
        {
          label: "上课教室",
          items: [{ type: "rooms", id: "room-m301", label: "M-301", meta: "音乐教室" }],
        },
        {
          label: "已报名学生",
          items: [
            { type: "students", id: "student-may", label: "May Lee", meta: "已付款" },
            { type: "students", id: "student-lina", label: "Lina Wong", meta: "已付款" },
          ],
        },
      ],
    },
  ],
  rooms: [
    {
      id: "room-a201",
      type: "rooms",
      name: "A-201",
      subtitle: "主教学楼 · 20 人容量",
      status: "started",
      stats: [
        { label: "今日课程", value: "3" },
        { label: "本周课程", value: "14" },
        { label: "容量", value: "20" },
      ],
      fields: [
        { label: "地点", value: "Block A Level 2" },
        { label: "设备", value: "投影、白板、音响" },
        { label: "开放时间", value: "08:00 - 21:00" },
      ],
      relations: [
        {
          label: "使用中的课程",
          items: [
            { type: "courses", id: "course-chinese-y7", label: "语文 Year 7 Sun", meta: "周六 09:00" },
            { type: "courses", id: "course-math-y7", label: "数学 Year 7 Sat", meta: "临时调课" },
          ],
        },
        {
          label: "负责老师",
          items: [{ type: "teachers", id: "teacher-zhang", label: "张老师", meta: "常用教室" }],
        },
      ],
    },
    {
      id: "room-b102",
      type: "rooms",
      name: "B-102",
      subtitle: "副楼 · 16 人容量",
      status: "open",
      stats: [
        { label: "今日课程", value: "2" },
        { label: "本周课程", value: "9" },
        { label: "容量", value: "16" },
      ],
      fields: [
        { label: "地点", value: "Block B Level 1" },
        { label: "设备", value: "白板、平板支架" },
        { label: "开放时间", value: "10:00 - 20:00" },
      ],
      relations: [
        {
          label: "使用中的课程",
          items: [{ type: "courses", id: "course-math-y7", label: "数学 Year 7 Sat", meta: "周六 10:30" }],
        },
        {
          label: "负责老师",
          items: [{ type: "teachers", id: "teacher-sophia", label: "Ms Sophia", meta: "常用教室" }],
        },
      ],
    },
    {
      id: "room-m301",
      type: "rooms",
      name: "M-301",
      subtitle: "音乐楼 · 8 人容量",
      status: "started",
      stats: [
        { label: "今日课程", value: "1" },
        { label: "本周课程", value: "7" },
        { label: "容量", value: "8" },
      ],
      fields: [
        { label: "地点", value: "Music Block Level 3" },
        { label: "设备", value: "谱架、钢琴、隔音墙" },
        { label: "开放时间", value: "12:00 - 21:00" },
      ],
      relations: [
        {
          label: "使用中的课程",
          items: [{ type: "courses", id: "course-violin-beginner", label: "小提琴 Beginner", meta: "周三 18:00" }],
        },
        {
          label: "负责老师",
          items: [{ type: "teachers", id: "teacher-lim", label: "Lim 老师", meta: "音乐课" }],
        },
      ],
    },
  ],
  students: [
    {
      id: "student-allen",
      type: "students",
      name: "Allen Tan",
      subtitle: "Student Year 7 · 家长 012-2233445",
      status: "started",
      stats: [
        { label: "课程", value: "2" },
        { label: "出勤", value: "12/13" },
        { label: "余额", value: "RM 0" },
      ],
      fields: [
        { label: "学生编号", value: "STU-25001" },
        { label: "学校年级", value: "Year 7" },
        { label: "家长", value: "Mr Tan" },
        { label: "付款状态", value: "已付款" },
      ],
      relations: [
        {
          label: "报名课程",
          items: [
            { type: "courses", id: "course-chinese-y7", label: "语文 Year 7 Sun", meta: "3/12 完成" },
            { type: "courses", id: "course-math-y7", label: "数学 Year 7 Sat", meta: "2/8 完成" },
          ],
        },
        {
          label: "任课老师",
          items: [
            { type: "teachers", id: "teacher-zhang", label: "张老师", meta: "语文" },
            { type: "teachers", id: "teacher-sophia", label: "Ms Sophia", meta: "数学" },
          ],
        },
      ],
    },
    {
      id: "student-may",
      type: "students",
      name: "May Lee",
      subtitle: "Student Year 7 · 家长 017-9988776",
      status: "started",
      stats: [
        { label: "课程", value: "2" },
        { label: "出勤", value: "9/10" },
        { label: "余额", value: "RM 0" },
      ],
      fields: [
        { label: "学生编号", value: "STU-25002" },
        { label: "学校年级", value: "Year 7" },
        { label: "家长", value: "Ms Lee" },
        { label: "付款状态", value: "已付款" },
      ],
      relations: [
        {
          label: "报名课程",
          items: [
            { type: "courses", id: "course-chinese-y7", label: "语文 Year 7 Sun", meta: "3/12 完成" },
            { type: "courses", id: "course-violin-beginner", label: "小提琴 Beginner", meta: "2/8 完成" },
          ],
        },
        {
          label: "任课老师",
          items: [
            { type: "teachers", id: "teacher-zhang", label: "张老师", meta: "语文" },
            { type: "teachers", id: "teacher-lim", label: "Lim 老师", meta: "音乐" },
          ],
        },
      ],
    },
    {
      id: "student-jerry",
      type: "students",
      name: "Jerry Baker",
      subtitle: "Student Year 7 · 家长 013-4545454",
      status: "open",
      stats: [
        { label: "课程", value: "2" },
        { label: "出勤", value: "7/12" },
        { label: "余额", value: "RM 300" },
      ],
      fields: [
        { label: "学生编号", value: "STU-25003" },
        { label: "学校年级", value: "Year 7" },
        { label: "家长", value: "Mrs Baker" },
        { label: "付款状态", value: "待付款" },
      ],
      relations: [
        {
          label: "报名课程",
          items: [
            { type: "courses", id: "course-chinese-y7", label: "语文 Year 7 Sun", meta: "待付款" },
            { type: "courses", id: "course-math-y7", label: "数学 Year 7 Sat", meta: "已退款" },
          ],
        },
        {
          label: "任课老师",
          items: [
            { type: "teachers", id: "teacher-zhang", label: "张老师", meta: "语文" },
            { type: "teachers", id: "teacher-sophia", label: "Ms Sophia", meta: "数学" },
          ],
        },
      ],
    },
    {
      id: "student-lina",
      type: "students",
      name: "Lina Wong",
      subtitle: "Student Year 6 · 家长 011-3344556",
      status: "started",
      stats: [
        { label: "课程", value: "2" },
        { label: "出勤", value: "8/9" },
        { label: "余额", value: "RM 0" },
      ],
      fields: [
        { label: "学生编号", value: "STU-25004" },
        { label: "学校年级", value: "Year 6" },
        { label: "家长", value: "Mr Wong" },
        { label: "付款状态", value: "已付款" },
      ],
      relations: [
        {
          label: "报名课程",
          items: [
            { type: "courses", id: "course-chinese-y7", label: "语文 Year 7 Sun", meta: "插班" },
            { type: "courses", id: "course-violin-beginner", label: "小提琴 Beginner", meta: "2/8 完成" },
          ],
        },
        {
          label: "任课老师",
          items: [
            { type: "teachers", id: "teacher-zhang", label: "张老师", meta: "语文" },
            { type: "teachers", id: "teacher-lim", label: "Lim 老师", meta: "音乐" },
          ],
        },
      ],
    },
    {
      id: "student-nora",
      type: "students",
      name: "Nora Lim",
      subtitle: "Student Year 7 · 家长 016-7788990",
      status: "started",
      stats: [
        { label: "课程", value: "1" },
        { label: "出勤", value: "2/2" },
        { label: "余额", value: "RM 0" },
      ],
      fields: [
        { label: "学生编号", value: "STU-25005" },
        { label: "学校年级", value: "Year 7" },
        { label: "家长", value: "Ms Lim" },
        { label: "付款状态", value: "已付款" },
      ],
      relations: [
        {
          label: "报名课程",
          items: [{ type: "courses", id: "course-math-y7", label: "数学 Year 7 Sat", meta: "2/8 完成" }],
        },
        {
          label: "任课老师",
          items: [{ type: "teachers", id: "teacher-sophia", label: "Ms Sophia", meta: "数学" }],
        },
      ],
    },
  ],
  teachers: [
    {
      id: "teacher-zhang",
      type: "teachers",
      name: "张老师",
      subtitle: "Senior Teacher · 中文 / 写作",
      status: "started",
      stats: [
        { label: "课程", value: "1" },
        { label: "学生", value: "12" },
        { label: "本周课", value: "4" },
      ],
      fields: [
        { label: "老师编号", value: "TCH-1001" },
        { label: "电话", value: "012-8888999" },
        { label: "常用教室", value: "A-201" },
        { label: "状态", value: "可排课" },
      ],
      relations: [
        {
          label: "负责课程",
          items: [{ type: "courses", id: "course-chinese-y7", label: "语文 Year 7 Sun", meta: "12 名学生" }],
        },
        {
          label: "学生",
          items: [
            { type: "students", id: "student-allen", label: "Allen Tan", meta: "已付款" },
            { type: "students", id: "student-may", label: "May Lee", meta: "已付款" },
            { type: "students", id: "student-jerry", label: "Jerry Baker", meta: "待付款" },
            { type: "students", id: "student-lina", label: "Lina Wong", meta: "已付款" },
          ],
        },
        {
          label: "常用教室",
          items: [{ type: "rooms", id: "room-a201", label: "A-201", meta: "主教学楼" }],
        },
      ],
    },
    {
      id: "teacher-sophia",
      type: "teachers",
      name: "Ms Sophia",
      subtitle: "Math Teacher · Year 7",
      status: "started",
      stats: [
        { label: "课程", value: "1" },
        { label: "学生", value: "8" },
        { label: "本周课", value: "3" },
      ],
      fields: [
        { label: "老师编号", value: "TCH-1002" },
        { label: "电话", value: "013-1111222" },
        { label: "常用教室", value: "B-102" },
        { label: "状态", value: "可排课" },
      ],
      relations: [
        {
          label: "负责课程",
          items: [{ type: "courses", id: "course-math-y7", label: "数学 Year 7 Sat", meta: "8 名学生" }],
        },
        {
          label: "学生",
          items: [
            { type: "students", id: "student-allen", label: "Allen Tan", meta: "已付款" },
            { type: "students", id: "student-jerry", label: "Jerry Baker", meta: "已退款" },
            { type: "students", id: "student-nora", label: "Nora Lim", meta: "已付款" },
          ],
        },
        {
          label: "常用教室",
          items: [{ type: "rooms", id: "room-b102", label: "B-102", meta: "副楼" }],
        },
      ],
    },
    {
      id: "teacher-lim",
      type: "teachers",
      name: "Lim 老师",
      subtitle: "Music Teacher · Violin",
      status: "started",
      stats: [
        { label: "课程", value: "1" },
        { label: "学生", value: "6" },
        { label: "本周课", value: "2" },
      ],
      fields: [
        { label: "老师编号", value: "TCH-1003" },
        { label: "电话", value: "016-3333666" },
        { label: "常用教室", value: "M-301" },
        { label: "状态", value: "可排课" },
      ],
      relations: [
        {
          label: "负责课程",
          items: [{ type: "courses", id: "course-violin-beginner", label: "小提琴 Beginner", meta: "6 名学生" }],
        },
        {
          label: "学生",
          items: [
            { type: "students", id: "student-may", label: "May Lee", meta: "已付款" },
            { type: "students", id: "student-lina", label: "Lina Wong", meta: "已付款" },
          ],
        },
        {
          label: "常用教室",
          items: [{ type: "rooms", id: "room-m301", label: "M-301", meta: "音乐楼" }],
        },
      ],
    },
  ],
};

function findEntity(type: EntityType, id: string) {
  return data[type].find((item) => item.id === id) ?? data[type][0];
}

function getModuleTitle(type: EntityType) {
  return modules.find((module) => module.type === type)?.title ?? "";
}

export function AdminConsole() {
  const [activeType, setActiveType] = useState<EntityType>("courses");
  const [activeId, setActiveId] = useState(data.courses[0].id);

  const activeEntity = useMemo(() => findEntity(activeType, activeId), [activeType, activeId]);
  const activeList = data[activeType];

  function openEntity(type: EntityType, id: string) {
    setActiveType(type);
    setActiveId(id);
  }

  function switchModule(type: EntityType) {
    setActiveType(type);
    setActiveId(data[type][0].id);
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar" aria-label="后台模块">
        <div className="brand-mark">P</div>
        <nav className="module-nav">
          {modules.map((module) => (
            <button
              className={module.type === activeType ? "module-button is-active" : "module-button"}
              key={module.type}
              onClick={() => switchModule(module.type)}
              type="button"
            >
              <span>{module.title}</span>
              <small>{data[module.type].length} 项</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">教学管理后台</p>
            <h1>{getModuleTitle(activeType)}</h1>
          </div>
          <div className="topbar-actions">
            <button type="button">新增</button>
            <button type="button">导出</button>
          </div>
        </header>

        <section className="overview-grid" aria-label="模块概览">
          {modules.map((module) => (
            <button
              className={module.type === activeType ? "overview-card is-active" : "overview-card"}
              key={module.type}
              onClick={() => switchModule(module.type)}
              type="button"
            >
              <strong>{module.title}</strong>
              <span>{module.description}</span>
              <b>{data[module.type].length}</b>
            </button>
          ))}
        </section>

        <section className="content-grid">
          <EntityList activeId={activeId} items={activeList} onOpen={openEntity} />
          <EntityDetail entity={activeEntity} onOpen={openEntity} />
        </section>
      </section>
    </main>
  );
}

function EntityList({
  activeId,
  items,
  onOpen,
}: {
  activeId: string;
  items: Entity[];
  onOpen: (type: EntityType, id: string) => void;
}) {
  return (
    <section className="panel list-panel">
      <div className="panel-header">
        <div>
          <p>列表</p>
          <h2>{getModuleTitle(items[0].type)}</h2>
        </div>
        <span>{items.length} 项</span>
      </div>
      <div className="entity-list">
        {items.map((item) => (
          <button
            className={item.id === activeId ? "entity-row is-active" : "entity-row"}
            key={item.id}
            onClick={() => onOpen(item.type, item.id)}
            type="button"
          >
            <span>
              <strong>{item.name}</strong>
              <small>{item.subtitle}</small>
            </span>
            <em className={`status-pill ${statusClass[item.status]}`}>{statusText[item.status]}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function EntityDetail({
  entity,
  onOpen,
}: {
  entity: Entity;
  onOpen: (type: EntityType, id: string) => void;
}) {
  return (
    <section className="panel detail-panel">
      <div className="detail-title">
        <div>
          <p>{getModuleTitle(entity.type)}</p>
          <h2>{entity.name}</h2>
          <span>{entity.subtitle}</span>
        </div>
        <em className={`status-pill ${statusClass[entity.status]}`}>{statusText[entity.status]}</em>
      </div>

      <div className="stat-grid">
        {entity.stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <section className="detail-section">
        <h3>基础资料</h3>
        <div className="field-grid">
          {entity.fields.map((field) => (
            <div className="field-item" key={field.label}>
              <span>{field.label}</span>
              <strong>{field.value}</strong>
            </div>
          ))}
        </div>
      </section>

      {entity.relations.map((group) => (
        <section className="detail-section" key={group.label}>
          <div className="section-heading">
            <h3>{group.label}</h3>
            <span>{group.items.length}</span>
          </div>
          <div className="relation-grid">
            {group.items.map((item) => (
              <button
                className="relation-card"
                key={`${item.type}-${item.id}`}
                onClick={() => onOpen(item.type, item.id)}
                type="button"
              >
                <span>
                  <strong>{item.label}</strong>
                  {item.meta ? <small>{item.meta}</small> : null}
                </span>
                <b>{getModuleTitle(item.type).replace("管理", "")}</b>
              </button>
            ))}
          </div>
        </section>
      ))}

      {entity.note ? <p className="detail-note">{entity.note}</p> : null}
    </section>
  );
}
