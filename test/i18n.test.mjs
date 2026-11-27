import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fill, hasEnglish, translate } from '../public/js/i18n.mjs';
import { PUSH_LANGS, pushText } from '../src/push/texts.mjs';

const JS = path.join(import.meta.dirname, '..', 'public', 'js');
const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;
const T_CALL = /(?<![\w$.])t\(\s*'((?:[^'\\]|\\.)*)'/g;
const QUOTED = /'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"/g;
const UNTRANSLATED_FILES = /^(i18n|en-[a-z0-9-]+)\.mjs$/;

const unescape = text => text.replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch));

async function clientModules() {
  const names = (await fs.readdir(JS)).filter(name => name.endsWith('.mjs') && !UNTRANSLATED_FILES.test(name));
  return Promise.all(names.map(async name => [name, await fs.readFile(path.join(JS, name), 'utf8')]));
}

test('every translated client string has an English entry', async () => {
  const missing = [];
  for (const [name, source] of await clientModules()) {
    for (const match of source.matchAll(T_CALL)) {
      if (!hasEnglish(unescape(match[1]))) missing.push(`${name}: ${match[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('no Vietnamese text is left outside t() in client modules', async () => {
  const left = [];
  for (const [name, source] of await clientModules()) {
    for (const match of source.matchAll(QUOTED)) {
      const staticText = match[0].startsWith('`') ? match[0].replace(/\$\{[^`]*?\}(?=[^}]*?(\$\{|`$))/g, '') : match[0];
      if (!VIETNAMESE.test(staticText)) continue;
      const before = source.slice(0, match.index).trimEnd();
      if (!/(?<![\w$.])t\($/.test(before)) left.push(`${name}: ${match[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(left, []);
});

test('Vietnamese text in index.html has an English entry', async () => {
  const html = (await fs.readFile(path.join(JS, '..', 'index.html'), 'utf8')).replace(/<script[\s\S]*?<\/script>/g, '');
  const texts = [
    ...[...html.matchAll(/>([^<>]+)</g)].map(match => match[1].trim()),
    ...[...html.matchAll(/(?:title|placeholder|aria-label)="([^"]+)"/g)].map(match => match[1].trim()),
  ].filter(text => VIETNAMESE.test(text));
  assert.ok(texts.length > 20);
  assert.deepEqual(texts.filter(text => !hasEnglish(text)), []);
});

test('translation falls back to Vietnamese and fills placeholders', () => {
  assert.equal(translate('Phiên mới', 'en'), 'New session');
  assert.equal(translate('Phiên mới', 'vi'), 'Phiên mới');
  assert.equal(translate('chữ chưa có bản dịch', 'en'), 'chữ chưa có bản dịch');
  assert.equal(fill('{0} min, {1}', [5, 'x']), '5 min, x');
  assert.equal(fill('{0} {1}', [1]), '1 {1}');
});

test('push texts exist in every language with the same placeholders', () => {
  const keys = ['waiting', 'done', 'test', 'machineDown', 'machineUp', 'diskLow', 'diskLowBody', 'crashed', 'ttydBody'];
  for (const lang of PUSH_LANGS) {
    for (const key of keys) {
      const text = pushText(lang, key, 'A', 'B');
      assert.ok(text && !/\{\d\}/.test(text), `${lang}.${key}`);
    }
  }
  assert.equal(pushText('en', 'machineDown', 'PC'), 'PC is offline');
  assert.equal(pushText('xx', 'done'), 'đã xong');
});
