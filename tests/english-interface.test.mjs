import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const portal = readFileSync(new URL('../app/management-portal.tsx', import.meta.url), 'utf8');
test('interface stays English without a misleading language switch', () => {
  assert.match(portal, /const \[language\] = useState<Language>\("en"\)/);
  assert.doesNotMatch(portal, /setLanguage\(|className="language-toggle"/);
  const details = portal.slice(portal.indexOf('function DetailEditAction'));
  assert.doesNotMatch(details, /[\p{Script=Han}]/u);
  assert.match(portal, /chinese: 'Chinese', malay: 'Malay', english: 'English'/);
});
test('calendar retains original course titles rather than translating SKU data', () => {
  const calendar = portal.slice(portal.indexOf('function CalendarCourseTitle'), portal.indexOf('function cohortPhase'));
  assert.match(calendar, /get\(event, 'course_title'\)/);
  assert.doesNotMatch(calendar, /[\p{Script=Han}]/u);
  assert.match(readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8'), /<html lang="en">/);
});
