import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  initializeLocalDatabase,
  findApplicationDatabase,
  localArguments,
} from "../scripts/prepare-local-db.mjs";

function emptyDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const directory = new URL("../drizzle/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, directory), "utf8"));
  return db;
}

test("fresh initialization provides compatible schema and approved basic offers without demo records", async () => {
  const db = emptyDatabase();
  try {
    await initializeLocalDatabase(db);
    for (const table of [
      "students",
      "teachers",
      "class_runs",
      "class_sessions",
      "student_invoices",
      "pass_orders",
      "portal_accounts",
    ])
      assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM teaching_languages").get().n,
      3,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM teaching_centres").get().n,
      2,
    );
    const offer = db
      .prepare("SELECT * FROM pass_products WHERE id='pass-monthly'")
      .get();
    assert.deepEqual(
      [
        offer.onsite_credits,
        offer.online_credits,
        offer.study_credits,
        offer.price,
        offer.validity_type,
      ],
      [4, 6, 2, 160, "calendar_month"],
    );
    assert.deepEqual(
      db
        .prepare(
          "SELECT unit_price FROM pass_products WHERE id!='pass-monthly' ORDER BY sort_order",
        )
        .all()
        .map((row) => row.unit_price),
      [20, 10, 10],
    );
    assert.ok(
      db
        .prepare("PRAGMA table_info(students)")
        .all()
        .some((column) => column.name === "avatar_url"),
    );
    assert.ok(
      db
        .prepare("PRAGMA table_info(course_catalogs)")
        .all()
        .some((column) => column.name === "teaching_centre_id"),
    );
    assert.equal(
      db
        .prepare(
          "SELECT value FROM app_settings WHERE key='portal_runtime_ready_v2'",
        )
        .get().value,
      "true",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("repeated local initialization preserves configured offers and migrates legacy balances only once", async () => {
  const db = emptyDatabase();
  try {
    await initializeLocalDatabase(db);
    db.exec(
      "UPDATE pass_products SET price=175,name='Configured monthly plan' WHERE id='pass-monthly'; INSERT INTO students(id,code,name,level) VALUES('existing','existing','Existing learner','G4'); INSERT INTO student_passes(id,student_id,product_id,name,credit_type,valid_from,valid_until,onsite_remaining,online_remaining,study_remaining,status) VALUES('legacy','existing','pass-monthly','Previously sold pass','bundle','2026-10-01','2026-10-31',4,6,2,'active')",
    );
    await initializeLocalDatabase(db);
    await initializeLocalDatabase(db);
    const product = db
      .prepare("SELECT price,name FROM pass_products WHERE id='pass-monthly'")
      .get();
    assert.deepEqual(
      [product.price, product.name],
      [175, "Configured monthly plan"],
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM students").get().n, 1);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM student_passes WHERE credit_type IN ('onsite','online','study')",
        )
        .get().n,
      3,
    );
    assert.equal(
      db.prepare("SELECT status FROM student_passes WHERE id='legacy'").get()
        .status,
      "fulfilled",
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM pass_orders").get().n, 0);
  } finally {
    db.close();
  }
});

test("local selection refuses ambiguous application databases and unsupported remote arguments", () => {
  assert.throws(
    () => localArguments(["--remote"]),
    /Remote operations are not supported/,
  );
  assert.throws(() => localArguments(["--persist-to"]), /Usage/);
  const root = mkdtempSync(resolve(tmpdir(), "mpec-local-db-selection-"));
  const directory = resolve(root, "v3/d1/miniflare-D1DatabaseObject");
  mkdirSync(directory, { recursive: true });
  assert.throws(() => findApplicationDatabase(root), /found 0/);
  for (const name of ["one", "two"]) {
    const db = new DatabaseSync(resolve(directory, `${name}.sqlite`));
    db.exec(
      "CREATE TABLE students(id); CREATE TABLE course_catalogs(id); CREATE TABLE app_settings(id); CREATE TABLE pass_products(id)",
    );
    db.close();
    if (name === "one")
      assert.equal(
        findApplicationDatabase(root),
        resolve(directory, "one.sqlite"),
      );
  }
  assert.throws(() => findApplicationDatabase(root), /found 2/);
});
