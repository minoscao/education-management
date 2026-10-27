import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const applicationTables = [
  "students",
  "course_catalogs",
  "app_settings",
  "pass_products",
];

export function localArguments(args) {
  let persistTo = resolve(projectRoot, ".wrangler/state");
  for (let i = 0; i < args.length; i++) {
    if (
      args[i] !== "--persist-to" ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error(
        "Usage: node scripts/prepare-local-db.mjs [--persist-to <local directory>]. Remote operations are not supported.",
      );
    persistTo = resolve(projectRoot, args[++i]);
  }
  return { persistTo };
}

function sqliteFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory()
      ? sqliteFiles(path)
      : entry.isFile() && entry.name.endsWith(".sqlite")
        ? [path]
        : [];
  });
}

export function findApplicationDatabase(persistTo) {
  const files = sqliteFiles(resolve(persistTo, "v3/d1"));
  const matches = files.filter((path) => {
    if (basename(path) === "metadata.sqlite") return false;
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const names = new Set(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => row.name),
      );
      return applicationTables.every((name) => names.has(name));
    } finally {
      db.close();
    }
  });
  if (matches.length !== 1)
    throw new Error(
      `Expected exactly one local education database under ${persistTo}; found ${matches.length}. Select its dedicated --persist-to directory before continuing.`,
    );
  return matches[0];
}

export function sqliteAdapter(db) {
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...input) {
          values = input;
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
      const savepoint = `local_init_${crypto.randomUUID().replaceAll("-", "")}`;
      db.exec(`SAVEPOINT ${savepoint}`);
      try {
        const results = statements.map((statement) => statement.execute());
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return results;
      } catch (error) {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    },
  };
}

// Build the same application modules for this Node-only maintenance command.
// Files are assigned before imports are traversed, preserving circular imports.
async function runtimeModules() {
  const directory = resolve(
    projectRoot,
    ".wrangler/local-init-runtime",
    String(process.pid),
  );
  mkdirSync(directory, { recursive: true });
  const compiled = new Map();
  function compile(path) {
    if (compiled.has(path)) return compiled.get(path);
    const output = resolve(directory, basename(path, ".ts") + ".mjs");
    compiled.set(path, output);
    const js = ts
      .transpileModule(readFileSync(path, "utf8"), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
        },
      })
      .outputText.replace(
        /from (["'])(\.[^"']+)\1/g,
        (_match, quote, specifier) => {
          const dependency = compile(resolve(dirname(path), specifier + ".ts"));
          return `from ${quote}${pathToFileURL(dependency).href}${quote}`;
        },
      );
    writeFileSync(output, js);
    return output;
  }
  const schedule = compile(
    resolve(projectRoot, "app/lib/scheduling-schema.ts"),
  );
  const learning = compile(resolve(projectRoot, "app/lib/learning-store.ts"));
  return {
    ...(await import(pathToFileURL(schedule).href)),
    ...(await import(pathToFileURL(learning).href)),
  };
}

export async function initializeLocalDatabase(db) {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  const adapter = sqliteAdapter(db);
  const { ensureSchedulingSchema, LearningStore } = await runtimeModules();
  db.exec("BEGIN IMMEDIATE");
  try {
    // These columns existed only in legacy request-time initializers.
    for (const [table, columns] of Object.entries({
      students: { avatar_url: "TEXT NOT NULL DEFAULT ''" },
      course_catalogs: {
        teaching_centre_id: "TEXT REFERENCES teaching_centres(id)",
      },
      // Repair even a previously marked legacy database before its guarded migration.
      class_enrollments: {
        pass_id: "TEXT",
        delivery_mode: "TEXT NOT NULL DEFAULT 'onsite'",
      },
    })) {
      const present = new Set(
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((column) => column.name),
      );
      for (const [name, definition] of Object.entries(columns)) {
        if (!present.has(name))
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
    await ensureSchedulingSchema(adapter);
    const learning = new LearningStore(adapter);
    await learning.prepareLegacySchema();
    await learning.migrateLegacyCards();

    db.exec(`INSERT OR IGNORE INTO teaching_languages(id,code,name,display_color) VALUES
      ('lang-ce','CE','Mandarin + English','#2563EB'),
      ('lang-me','ME','Bahasa + English','#D97706'),
      ('lang-zh','ZH','Chinese only','#0F766E');
      INSERT OR IGNORE INTO teaching_centres(id,code,name,status) VALUES
      ('centre-ppm','PPM','Pusat Perkembangan Minda','active'),
      ('centre-pb','PB','Pusat Bahasa','active');`);

    const insertProduct = db.prepare(`INSERT OR IGNORE INTO pass_products
      (id,code,name,description,onsite_credits,online_credits,study_credits,validity_type,validity_days,price,unit_price,issuance_mode,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'tickets',?)`);
    for (const product of [
      [
        "pass-monthly",
        "MONTHLY-PASS",
        "Monthly learning pass",
        "4 onsite lessons, 6 online lessons and 2 study visits. Expires at the end of the service month.",
        4,
        6,
        2,
        "calendar_month",
        30,
        160,
        null,
        1,
      ],
      [
        "pass-onsite-4",
        "ONSITE-4",
        "Onsite 4-class card",
        "Four additional onsite lessons at RM20 per lesson.",
        4,
        0,
        0,
        "rolling_days",
        90,
        80,
        20,
        2,
      ],
      [
        "pass-online-6",
        "ONLINE-6",
        "Online 6-class card",
        "Six additional online lessons at RM10 per lesson.",
        0,
        6,
        0,
        "rolling_days",
        90,
        60,
        10,
        3,
      ],
      [
        "pass-study-5",
        "STUDY-5",
        "Study access 10-visit pass",
        "Ten supervised study visits at RM10 per visit.",
        0,
        0,
        10,
        "rolling_days",
        90,
        100,
        10,
        4,
      ],
    ])
      insertProduct.run(...product);
    // The legacy guard enables database constraints; it no longer runs demo seeding.
    db.prepare(
      "INSERT OR IGNORE INTO app_settings(key,value) VALUES('portal_runtime_ready_v2','true')",
    ).run();
    db.prepare(
      "INSERT OR IGNORE INTO app_settings(key,value) VALUES('local_schema_initialized_v1','true')",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    students: db.prepare("SELECT COUNT(*) count FROM students").get().count,
    teachers: db.prepare("SELECT COUNT(*) count FROM teachers").get().count,
    products: db.prepare("SELECT COUNT(*) count FROM pass_products").get()
      .count,
  };
}

export async function prepareLocalDatabase({
  persistTo = resolve(projectRoot, ".wrangler/state"),
} = {}) {
  const target = resolve(persistTo);
  mkdirSync(target, { recursive: true });
  console.log(`Applying local migrations in ${target}…`);
  // Call Wrangler's CLI directly: its Windows bin wrapper leaves an IPC channel
  // open after local migrations in this runtime, preventing startup from finishing.
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--experimental-vm-modules",
      resolve(projectRoot, "node_modules/wrangler/wrangler-dist/cli.js"),
      "d1",
      "migrations",
      "apply",
      "education-management-db",
      "--local",
      "--config",
      resolve(projectRoot, "wrangler.jsonc"),
      "--persist-to",
      target,
    ],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        CI: "true",
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_LOG_PATH: resolve(projectRoot, ".wrangler/local-init-logs"),
      },
    },
  );
  const logPath = resolve(target, "local-migrations.log");
  writeFileSync(logPath, (result.stdout || "") + (result.stderr || ""));
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Local migrations failed (exit ${result.status ?? result.signal}); application initialization was not run. See ${logPath}.\n${String(result.stderr || result.stdout).slice(-3000)}`,
    );
  const path = findApplicationDatabase(target),
    db = new DatabaseSync(path);
  try {
    const summary = await initializeLocalDatabase(db);
    console.log(`Local database ready: ${path}`);
    console.log(
      `Preserved ${summary.students} students and ${summary.teachers} teachers; ${summary.products} products available. No demo people, classes or bills were generated.`,
    );
    return { path, ...summary };
  } finally {
    db.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await prepareLocalDatabase(localArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
