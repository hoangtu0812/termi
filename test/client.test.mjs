import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.join(import.meta.dirname, '..', 'public');
const JS = path.join(PUBLIC, 'js');
const IMPORT = /^import \{([^}]+)\} from '\.\/([a-z0-9-]+\.mjs)';$/gm;
const EXPORT = /^export (?:async )?(?:function|const|let) ([A-Za-z_$][\w$]*)/gm;

async function modules() {
  const names = (await fs.readdir(JS)).filter(name => name.endsWith('.mjs'));
  const texts = await Promise.all(names.map(name => fs.readFile(path.join(JS, name), 'utf8')));
  return new Map(names.map((name, index) => [name, texts[index]]));
}

const exportsOf = text => new Set([...text.matchAll(EXPORT)].map(match => match[1]));

test('every client import names an existing export', async () => {
  const all = await modules();
  for (const [name, text] of all) {
    for (const [, list, from] of text.matchAll(IMPORT)) {
      assert.ok(all.has(from), `${name} imports missing ${from}`);
      const exported = exportsOf(all.get(from));
      for (const imported of list.split(',').map(item => item.trim()).filter(Boolean)) {
        assert.ok(exported.has(imported), `${name} imports ${imported}, which ${from} does not export`);
      }
    }
  }
});

test('index.html is markup that loads existing styles and the entry module', async () => {
  const html = await fs.readFile(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.equal(/<style[\s>]/.test(html), false);
  assert.equal(/<script>/.test(html), false);
  const assets = [...html.matchAll(/(?:href|src)="\/((?:css|js)\/[a-z0-9-]+\.(?:css|m?js))"/g)].map(match => match[1]);
  assert.ok(assets.includes('js/main.mjs'));
  assert.ok(assets.filter(asset => asset.endsWith('.css')).length > 0);
  for (const asset of assets) await fs.access(path.join(PUBLIC, asset));
});

const TRUSTED_HTML = [
  /\.innerHTML = icon\(/,
  /\.innerHTML = icon\('chevron'\) \+ icon\('folder'\);$/,
  /\.innerHTML = icon\('folder'\) \+ 'Thư mục khác…';$/,
  /\.innerHTML = '<img src="\/icon\.svg" alt="">';$/,
  /\.innerHTML = LOGO\[agent\]$/,
  /\.insertAdjacentHTML\('afterbegin', icon\(e\.dataset\.i\)\);$/,
  /\.insertAdjacentHTML\('afterbegin', graphSvg\(c, row, width\)\);$/,
  /t\.innerHTML = marked\.parse\(text, \{ gfm: true(, breaks: true)? \}\);$/,
  /\.innerHTML = hljs\.highlight\(/,
  /<body>\$\{t\.innerHTML\}/,
];

test('HTML is only built from trusted markup', async () => {
  for (const [name, text] of await modules()) {
    for (const line of text.split('\n').filter(l => /innerHTML|insertAdjacentHTML|outerHTML/.test(l))) {
      assert.ok(TRUSTED_HTML.some(pattern => pattern.test(line.trim())), `${name}: ${line.trim()}`);
    }
  }
});
