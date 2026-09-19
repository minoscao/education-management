import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../app/lib/resource-conflicts.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { findResourceConflicts } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('conflicts use resource and time; adjacent, cancelled and duplicate lesson rows are excluded', () => {
  const event = (id, room, start, end, status = 'booked') => ({ class_session_id: id, room, name: room, course_title: id, starts_at: `2026-09-20 ${start}`, ends_at: `2026-09-20 ${end}`, status });
  const rows = [event('a', 'R1', '10:00', '11:00'), event('b', 'R1', '10:30', '11:30'), event('c', 'R1', '11:30', '12:00'), event('d', 'R2', '10:00', '12:00'), event('cancelled', 'R1', '10:00', '12:00', 'cancelled')];
  assert.equal(findResourceConflicts(rows, 'room', 'name', 'Classroom').length, 1);
  assert.equal(findResourceConflicts([rows[0], rows[0]], 'room', 'name', 'Classroom').length, 0);
});
