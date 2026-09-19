import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/lib/contact.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { whatsappLink, whatsappNumber } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('WhatsApp links normalize Malaysian and explicit international numbers without guessing missing country codes', () => {
  assert.equal(whatsappNumber('011-1234 5678'), '601112345678');
  assert.equal(whatsappNumber('+60 11-1234 5678'), '601112345678');
  assert.equal(whatsappNumber('0065 8123 4567'), '6581234567');
  assert.equal(whatsappNumber('81234567'), null);
  assert.equal(whatsappNumber('not provided'), null);
  assert.equal(whatsappNumber('123'), null);
  assert.equal(whatsappLink(''), null);
  assert.equal(whatsappLink('+65 8123 4567', 'Hello & welcome'), 'https://wa.me/6581234567?text=Hello%20%26%20welcome');
});
