export type CohortGroup = 'chinese' | 'malay' | 'english' | 'mixed';
type Slot = { day: number; time: string; grade: string; subject: string; group: CohortGroup; language: string };
export const weeklyPlan: Slot[] = [];
const add = (day: number, time: string, grade: string, subject: string, group: CohortGroup, language: string) =>
  weeklyPlan.push({ day, time, grade, subject, group, language });
for (const [day, grade, group] of [[1, 'G4', 'chinese'], [2, 'G6', 'chinese'], [3, 'G4', 'malay'], [4, 'G6', 'malay']] as const) {
  add(day, '14:30', grade, 'Mathematics', group, group === 'chinese' ? 'lang-zh' : 'lang-ms');
  add(day, '16:00', grade, 'English', group, 'lang-en');
}
add(5, '14:30', 'G5', 'Mathematics', 'chinese', 'lang-zh');
add(5, '16:00', 'G5', 'Mathematics', 'malay', 'lang-ms');
for (let day = 1; day <= 5; day++) {
  add(day, '18:30', `F${day}`, day >= 4 ? 'Elementary Mathematics' : 'Mathematics', 'english', 'lang-en');
  add(day, '20:00', `F${day}`, 'English', 'mixed', 'lang-en');
}
add(6, '08:30', 'F4', 'Advanced Mathematics', 'english', 'lang-en');
add(0, '08:30', 'F5', 'Advanced Mathematics', 'english', 'lang-en');
for (const [time, grade] of [['10:00', 'G4'], ['11:30', 'G6'], ['13:00', 'F1'], ['14:30', 'F2'], ['16:00', 'F3'], ['18:30', 'F4'], ['20:00', 'F5']])
  add(6, time, grade, 'Bahasa', 'mixed', 'lang-ms');
for (const [time, grade, subject] of [['10:00', 'F1', 'Mathematics'], ['11:30', 'F2', 'Mathematics'], ['13:00', 'F3', 'Mathematics'], ['14:30', 'F4', 'Elementary Mathematics'], ['16:00', 'F5', 'Elementary Mathematics'], ['18:30', 'F4', 'Advanced Mathematics'], ['20:00', 'F5', 'Advanced Mathematics']])
  add(0, time, grade, subject, 'malay', 'lang-ms');

export function planCourseKey(slot: Slot) { return `${slot.grade}-${slot.subject.replaceAll(' ', '-').toLowerCase()}`; }

// A single batch makes activation, old-slot retirement and the new timetable atomic.
export function weeklyPlanStatements() {
  const statements: { sql: string; values: (string | number)[] }[] = [];
  const push = (sql: string, ...values: (string | number)[]) => statements.push({ sql, values });
  push("INSERT OR IGNORE INTO teaching_languages(id,code,name,display_color) VALUES ('lang-en','EN','English','#7C3AED'),('lang-ms','MS','Bahasa Melayu','#DC4C59')");
  push("INSERT OR IGNORE INTO academic_terms(id,code,name,starts_on,ends_on,status) VALUES ('term-single-room','SINGLE-2026','Campus 1 · Weekly plan','2026-09-21','2026-12-13','active')");
  push("UPDATE classrooms SET name='Classroom 1',capacity=26,status='active' WHERE id='plan-room-math-sci'");
  const courses = new Set<string>();
  for (const [index, slot] of weeklyPlan.entries()) {
    const key = planCourseKey(slot), course = `weekly-course-${key}`, run = `weekly-run-${index + 1}`;
    const math = slot.subject.includes('Mathematics');
    const teacher = math ? (slot.grade.startsWith('G') ? 'teacher-lim-wei' : 'teacher-ng-jun') : slot.subject === 'English' ? 'teacher-hana' : 'teacher-mira';
    if (!courses.has(key)) {
      courses.add(key);
      push(`INSERT OR IGNORE INTO course_catalogs(id,code,title,subject,level,default_sessions,default_minutes,list_price,status,teaching_centre_id)
        VALUES (?,?,?,?,?,12,90,COALESCE((SELECT list_price FROM course_catalogs WHERE subject LIKE ? AND status = 'active' ORDER BY id LIMIT 1),0),'active',?)`,
      course, `W-${key}`, `${slot.grade} ${slot.subject}`, slot.subject, slot.grade, math ? '%Math%' : slot.subject, math ? 'centre-ppm' : 'centre-pb');
    }
    const groupName = { chinese: 'Chinese-primary group', malay: 'Malay-primary group', english: 'English-medium', mixed: 'Mixed group' }[slot.group];
    push(`INSERT OR IGNORE INTO class_runs(id,code,course_id,term_id,name,capacity,price,status,language_id,teacher_id,cohort_group,allow_late_join,delivery_mode)
      VALUES (?,?,?,'term-single-room',?,26,(SELECT list_price FROM course_catalogs WHERE id = ?),'open',?,?,?,1,'onsite')`,
    run, `W-${index + 1}`, course, `${slot.grade} ${slot.subject} · ${groupName}`, course, slot.language, teacher, slot.group);
    push(`INSERT OR IGNORE INTO teacher_languages(teacher_id,language_id) SELECT id,? FROM teachers WHERE id = ?`, slot.language, teacher);
    const offset = (slot.day + 6) % 7;
    push(`WITH RECURSIVE weeks(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM weeks WHERE n<12)
      INSERT OR IGNORE INTO class_sessions(id,class_run_id,session_no,topic,starts_at,ends_at,status)
      SELECT ?||'-'||n,?,n,?||' · Lesson '||n,
        strftime('%Y-%m-%d %H:%M',datetime('2026-09-21 '||?, '+'||(?+(n-1)*7)||' days')),
        strftime('%Y-%m-%d %H:%M',datetime('2026-09-21 '||?, '+'||(?+(n-1)*7)||' days','+90 minutes')),'scheduled' FROM weeks`,
    run, run, `${slot.grade} ${slot.subject}`, slot.time, offset, slot.time, offset);
    push(`INSERT OR IGNORE INTO class_resource_bookings(id,class_session_id,classroom_id,starts_at,ends_at,status)
      SELECT 'weekly-room-'||id,id,'plan-room-math-sci',starts_at,ends_at,'reserved' FROM class_sessions WHERE class_run_id = ?`, run);
    push(`INSERT OR IGNORE INTO class_teacher_bookings(id,class_session_id,teacher_id,starts_at,ends_at,pay_amount,pay_status,status)
      SELECT 'weekly-teacher-'||id,id,?,starts_at,ends_at,0,'unpaid','confirmed' FROM class_sessions WHERE class_run_id = ?`, teacher, run);
  }
  // Preserve financial and attendance history. Only future old-plan bookings are released.
  const oldRuns = "SELECT r.id FROM class_runs r JOIN course_catalogs c ON c.id=r.course_id WHERE c.teaching_centre_id IN ('centre-ppm','centre-pb') AND r.id NOT LIKE 'weekly-run-%'";
  const oldSessions = `SELECT id FROM class_sessions WHERE class_run_id IN (${oldRuns}) AND starts_at >= '2026-09-21' AND status = 'scheduled'`;
  push(`UPDATE learning_credit_events SET status='released' WHERE status='reserved' AND booking_id IN (SELECT id FROM class_student_bookings WHERE class_session_id IN (${oldSessions}))`);
  push(`UPDATE class_student_bookings SET status='cancelled' WHERE status='booked' AND class_session_id IN (${oldSessions})`);
  push(`UPDATE class_resource_bookings SET status='cancelled' WHERE class_session_id IN (${oldSessions})`);
  push(`UPDATE class_teacher_bookings SET status='cancelled' WHERE class_session_id IN (${oldSessions})`);
  push(`UPDATE class_sessions SET status='cancelled' WHERE id IN (${oldSessions})`);
  push(`UPDATE class_runs SET status='finished' WHERE id IN (${oldRuns})`);
  push("UPDATE course_catalogs SET status='inactive' WHERE teaching_centre_id IN ('centre-ppm','centre-pb') AND id NOT LIKE 'weekly-course-%'");
  push("INSERT OR IGNORE INTO app_settings(key,value) VALUES ('single_room_plan_v1','2026-09-21')");
  return statements;
}
