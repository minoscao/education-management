import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const file = process.argv[2];
if (!file) throw new Error('Provide a local D1 export. This check never connects to the remote database.');
const db = new DatabaseSync(':memory:');
// D1 exports can list child tables before their parents. Validate foreign keys after loading.
db.exec('PRAGMA foreign_keys = OFF');
db.exec(readFileSync(file, 'utf8'));
db.exec('PRAGMA foreign_keys = ON');
const before = db.prepare('SELECT COUNT(*) AS count FROM students').get().count;
const applied = new Set(db.prepare('SELECT name FROM d1_migrations').all().map(row => row.name));
for (const name of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  if (!applied.has(name)) db.exec(readFileSync(`drizzle/${name}`, 'utf8'));
}
const source = readFileSync('app/lib/learning-store.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText + '\n//# sourceURL=learning-store.ts';
const { LearningStore } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const adapter = {
  prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      async run() { return db.prepare(sql).run(...values); },
      execute() { db.prepare(sql).run(...values); },
    };
  },
  async batch(statements) {
    db.exec('BEGIN');
    try { for (const statement of statements) statement.execute(); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const store = new LearningStore(adapter);
await store.prepareLegacySchema();
await store.migrateLegacyCards();
await store.reconcileDemoEnrollments();
const repairedBookings = db.prepare('SELECT COUNT(*) AS n FROM class_student_bookings').get().n;
await store.prepareLegacySchema();
await store.migrateLegacyCards();
await store.reconcileDemoEnrollments();
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM class_student_bookings').get().n, repairedBookings);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM class_enrollments e WHERE e.id LIKE 'plan-enrollment-%' AND e.status = 'enrolled' AND NOT EXISTS (SELECT 1 FROM student_invoices i WHERE i.enrollment_id = e.id)").get().n, 0);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM students').get().count, before);
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
console.log(JSON.stringify({ studentsPreserved: before, bookings: repairedBookings, migrations: 'ok', initializationRetry: 'ok', foreignKeys: 'ok' }));
db.close();
