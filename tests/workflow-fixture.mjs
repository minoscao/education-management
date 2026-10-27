import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
const urls = new Map();
function compiled(url) {
  const key = url.href;
  if (urls.has(key)) return urls.get(key);
  const js = ts
    .transpileModule(readFileSync(url, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replace(/from ['"](.+?)['"]/g, (match, path) =>
      path.startsWith(".")
        ? `from '${compiled(new URL(path + ".ts", url))}'`
        : match,
    );
  const result = `data:text/javascript;base64,${Buffer.from(js + "\n//# sourceURL=" + url.pathname.split("/").at(-1)).toString("base64")}`;
  urls.set(key, result);
  return result;
}
export const load = (path) =>
  import(compiled(new URL("../app/lib/" + path + ".ts", import.meta.url)));
export function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../drizzle/", import.meta.url);
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(f, dir), "utf8"));
  function insert(table, values) {
    const record = { ...values };
    for (const f of db.prepare(`PRAGMA table_info(${table})`).all())
      if (f.notnull && f.dflt_value === null && !(f.name in record))
        record[f.name] = /INT|REAL/.test(f.type) ? 0 : `${table}-${f.name}`;
    db.prepare(
      `INSERT INTO ${table} (${Object.keys(record)}) VALUES (${Object.keys(record).map(() => "?")})`,
    ).run(...Object.values(record));
  }
  let fail = null,
    before = null;
  const adapter = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...values) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...values) };
        },
        async run() {
          return db.prepare(sql).run(...values);
        },
        execute() {
          return db.prepare(sql).run(...values);
        },
      };
    },
    async batch(statements) {
      if (before) {
        const fn = before;
        before = null;
        fn();
      }
      db.exec("BEGIN");
      try {
        for (const [i, s] of statements.entries()) {
          if (i === fail) throw new Error("Injected interruption");
          s.execute();
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const admin = {
    id: "admin",
    email: "admin@example.test",
    display_name: "Admin",
    role: "admin",
    student_id: null,
    teacher_id: null,
  };
  insert("academic_terms", {
    id: "term",
    code: "TEST-TERM",
    name: "Test term",
    starts_on: "2099-01-01",
    ends_on: "2100-12-31",
  });
  insert("classrooms", {
    id: "room",
    code: "TEST-ROOM",
    name: "Test room",
    capacity: 16,
  });
  insert("teachers", {
    id: "teacher",
    code: "TEST-TEACHER",
    name: "Test teacher",
  });
  insert("teaching_languages", {
    id: "language",
    code: "TEST-LANG",
    name: "English",
  });
  insert("teacher_languages", {
    teacher_id: "teacher",
    language_id: "language",
  });
  for (const [id, level] of [
    ["primary", "G4"],
    ["secondary", "F1"],
  ]) {
    insert("course_catalogs", {
      id,
      code: id,
      title: `${level} English`,
      level,
      subject: "English",
      status: "active",
    });
    insert("class_runs", {
      id: `run-${id}`,
      code: `R-${id}`,
      course_id: id,
      term_id: "term",
      name: `${level} class`,
      capacity: 16,
      status: "open",
    });
  }
  return {
    db,
    adapter,
    admin,
    insert,
    interrupt(index) {
      fail = index;
    },
    beforeBatch(fn) {
      before = fn;
    },
    close() {
      db.close();
    },
  };
}
export const registration = {
  fullName: "Workflow learner",
  gender: "female",
  enrollmentDate: "2026-10-22",
  email: "learner@example.test",
  studentPhone: "+60123456789",
  preferredLanguage: "English",
  schoolName: "Test school",
  schoolSystem: "sjk",
  level: "G6",
  guardianName: "Test guardian",
  relationship: "Mother",
  guardianGender: "female",
  guardianPhone: "+60123456780",
};
