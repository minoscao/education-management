import type { Database } from "./learning-store";

export const schedulingCompatibilityColumns = {
  class_runs: {
    allow_late_join: "INTEGER NOT NULL DEFAULT 1",
    language_id: "TEXT REFERENCES teaching_languages(id)",
    teacher_id: "TEXT REFERENCES teachers(id)",
    delivery_mode: "TEXT NOT NULL DEFAULT 'onsite'",
  },
  course_lesson_templates: {
    default_teacher_id: "TEXT REFERENCES teachers(id)",
    default_classroom_id: "TEXT REFERENCES classrooms(id)",
    default_pay_amount: "REAL DEFAULT 0",
  },
} as const;

/** Also called by migration preflight; safe for databases that already have the legacy columns. */
export async function ensureSchedulingSchema(db: Database) {
  for (const [table, definitions] of Object.entries(
    schedulingCompatibilityColumns,
  )) {
    const columns =
      (await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>())
        .results || [];
    if (!columns.length) continue; // The SQL migration creates new tables first.
    for (const [name, definition] of Object.entries(definitions)) {
      if (columns.some((c) => c.name === name)) continue;
      try {
        await db
          .prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
          .run();
      } catch (error) {
        const current =
          (
            await db
              .prepare(`PRAGMA table_info(${table})`)
              .all<{ name: string }>()
          ).results || [];
        if (!current.some((c) => c.name === name)) throw error;
      }
    }
  }
}
