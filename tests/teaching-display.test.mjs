import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/lib/teaching-display.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { teachingDisplay, teachingPalette, teachingSubject } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('calendar colour uses teaching language, not subject or course colour', () => {
  assert.equal(teachingDisplay({ course_title: 'F3 Bahasa', language_id: 'lang-ce', course_color: '#F00' }).colour, teachingPalette.chinese);
  assert.equal(teachingDisplay({ course_title: 'F3 English', language_id: 'lang-me' }).colour, teachingPalette.malay);
  assert.equal(teachingDisplay({ language_id: 'lang-zh' }).colour, teachingPalette.chinese);
  assert.equal(teachingDisplay({ language_id: 'lang-en' }).colour, teachingPalette.english);
  assert.equal(teachingDisplay({ language_name: 'English only' }).colour, teachingPalette.english);
  assert.equal(teachingDisplay({ language_name: 'Mandarin + English' }).colour, teachingPalette.chinese);
  assert.equal(teachingDisplay({ language_name: 'Bahasa + English' }).colour, teachingPalette.malay);
  assert.equal(teachingDisplay({ course_title: 'Chinese', language_name: '' }).medium, 'unknown');
});

test('independent curriculum is separate from teaching language', () => {
  for (const title of ['L1 English', 'Mathematics + Sudoku H3']) {
    assert.equal(teachingDisplay({ course_title: title, language_id: 'lang-me' }).independent, true);
  }
  for (const title of ['F3 English', 'G4 Chinese']) assert.equal(teachingDisplay({ course_title: title }).independent, false);
  assert.equal(teachingDisplay({ course_title: 'Communication', course_level: 'Lower Secondary F1-F3 / L1-L3' }).independent, false);
  assert.equal(teachingDisplay({ course_title: 'H3 English', curriculum: 'public' }).independent, false);
  assert.equal(teachingDisplay({ course_title: 'Chinese', curriculum: 'uec' }).independent, true);
});
test('audience colour stays separate from English teaching tags', () => {
  assert.equal(teachingDisplay({language_id:'lang-en',cohort_group:'chinese'}).colour,teachingPalette.chinese);
  assert.equal(teachingDisplay({language_id:'lang-en',cohort_group:'malay'}).colour,teachingPalette.malay);
  assert.equal(teachingDisplay({language_id:'lang-ms',cohort_group:'mixed'}).colour,teachingPalette.mixed);
  assert.equal(teachingDisplay({language_id:'lang-ms',cohort_group:'mixed'}).medium,'malay');
});

test('subject icons are independent from teaching language and curriculum', () => {
  assert.equal(teachingSubject({ subject: 'English', language_id: 'lang-me' }), 'english');
  assert.equal(teachingSubject({ course_title: 'Mathematics + Sudoku H3' }), 'math');
  assert.equal(teachingSubject({ subject: 'Chinese', language_id: 'lang-en' }), 'chinese');
});

test('grouped and individual timeline cards share subject icon, semantic colour and black tag', () => {
  const portal = readFileSync(new URL('../app/management-portal.tsx', import.meta.url), 'utf8');
  const group = portal.slice(portal.indexOf('function TimelineSlotGroup('), portal.indexOf('function TimelineSlotGroupDialog('));
  const single = portal.slice(portal.indexOf('function TimelineEvent('), portal.indexOf('function ResourceMatrix('));
  for (const component of [group, single]) {
    assert.match(component, /teachingStyle\(event\)/);
    assert.match(component, /<CalendarCourseTitle event={event}/);
  }
  assert.match(portal, /className="independent-course-tag"[^>]+title="Independent school \/ 独中"/);
  assert.match(portal, /className="calendar-subject-icon"/);
});
