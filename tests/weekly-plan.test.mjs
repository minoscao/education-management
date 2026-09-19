import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../app/lib/weekly-plan.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { weeklyPlan, planCourseKey, weeklyPlanStatements } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('reference timetable has 36 non-overlapping 90-minute slots and 24 grade/subject SKUs', () => {
  assert.equal(weeklyPlan.length, 36);
  assert.equal(new Set(weeklyPlan.map(planCourseKey)).size, 24);
  for (let day=0;day<7;day++) {
    const slots=weeklyPlan.filter(s=>s.day===day).map(s=>Number(s.time.slice(0,2))*60+Number(s.time.slice(3))).sort((a,b)=>a-b);
    assert.equal(slots.length, day===0||day===6 ? 8:4);
    for(let i=1;i<slots.length;i++) assert.ok(slots[i]-slots[i-1]>=90);
    assert.ok(slots.every(m=>m+90<=1050||m>=1110));
  }
  for (const grade of ['G4','G6']) {
    const english=weeklyPlan.filter(s=>s.grade===grade&&s.subject==='English');
    assert.deepEqual(english.map(s=>s.group),['chinese','malay']);
    assert.ok(english.every(s=>s.language==='lang-en'));
  }
  assert.equal(weeklyPlan.filter(s=>s.grade==='G5'&&!s.subject.includes('Mathematics')).length,0);
  for (const grade of ['F4','F5']) for(const subject of ['Elementary Mathematics','Advanced Mathematics']) {
    assert.deepEqual(new Set(weeklyPlan.filter(s=>s.grade===grade&&s.subject===subject).map(s=>s.language)),new Set(['lang-ms','lang-en']));
  }
});
test('plan SQL is repeatable, persists 432 sessions in one room and preserves old history', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE teaching_languages(id TEXT PRIMARY KEY,code,name,display_color);
    CREATE TABLE academic_terms(id TEXT PRIMARY KEY,code,name,starts_on,ends_on,status);
    CREATE TABLE classrooms(id TEXT PRIMARY KEY,name,capacity,status); INSERT INTO classrooms VALUES('plan-room-math-sci','Math',26,'active');
    CREATE TABLE course_catalogs(id TEXT PRIMARY KEY,code,title,subject,level,default_sessions,default_minutes,list_price,status,teaching_centre_id);
    INSERT INTO course_catalogs VALUES('old','old','G4 Math','Mathematics + Sudoku','G4',12,90,360,'active','centre-ppm');
    CREATE TABLE class_runs(id TEXT PRIMARY KEY,code,course_id,term_id,name,capacity,price,status,language_id,teacher_id,cohort_group,allow_late_join,delivery_mode);
    INSERT INTO class_runs(id,course_id,status) VALUES('old-run','old','open');
    CREATE TABLE teachers(id TEXT PRIMARY KEY); INSERT INTO teachers VALUES('teacher-hana'),('teacher-mira'),('teacher-lim-wei'),('teacher-ng-jun');
    CREATE TABLE teacher_languages(teacher_id,language_id,PRIMARY KEY(teacher_id,language_id));
    CREATE TABLE class_sessions(id TEXT PRIMARY KEY,class_run_id,session_no,topic,starts_at,ends_at,status);
    INSERT INTO class_sessions(id,class_run_id,starts_at,status) VALUES('past','old-run','2026-09-14','completed'),('future','old-run','2026-09-22','scheduled');
    CREATE TABLE class_resource_bookings(id TEXT PRIMARY KEY,class_session_id,classroom_id,starts_at,ends_at,status);
    CREATE TABLE class_teacher_bookings(id TEXT PRIMARY KEY,class_session_id,teacher_id,starts_at,ends_at,pay_amount,pay_status,status);
    CREATE TABLE class_student_bookings(id TEXT PRIMARY KEY,class_session_id,status);
    CREATE TABLE learning_credit_events(id TEXT PRIMARY KEY,booking_id,status);
    INSERT INTO class_student_bookings VALUES('booking','future','booked');
    INSERT INTO learning_credit_events VALUES('credit','booking','reserved');
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value);`);
  for(let n=0;n<2;n++) { db.exec('BEGIN'); for(const {sql,values} of weeklyPlanStatements()) db.prepare(sql).run(...values); db.exec('COMMIT'); }
  assert.equal(db.prepare("SELECT count(*) n FROM class_sessions WHERE id LIKE 'weekly-%'").get().n,432);
  assert.equal(db.prepare('SELECT count(DISTINCT classroom_id) n FROM class_resource_bookings').get().n,1);
  assert.equal(db.prepare("SELECT status FROM class_sessions WHERE id='past'").get().status,'completed');
  assert.equal(db.prepare("SELECT status FROM class_sessions WHERE id='future'").get().status,'cancelled');
  assert.equal(db.prepare("SELECT status FROM learning_credit_events WHERE id='credit'").get().status,'released');
  assert.equal(db.prepare("SELECT min(list_price) n FROM course_catalogs WHERE id LIKE 'weekly-%' AND subject LIKE '%Mathematics%'").get().n,360);
  db.close();
});
