import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findJsComments, findCssComments, findShellComments, findHtmlComments,
} from '../scripts/check-comments.mjs';
import { sourceViolations, docNameViolation, classify, isAppleDouble } from '../scripts/check.mjs';
import { cssClassViolations } from '../scripts/check-css.mjs';

test('macOS AppleDouble files from exFAT drives are skipped', () => {
  assert.equal(isAppleDouble('public/js/._main.mjs'), true);
  assert.equal(isAppleDouble('._README.md'), true);
  assert.equal(isAppleDouble('public/js/main.mjs'), false);
  assert.equal(isAppleDouble('docs/a._b.md'), false);
});

test('js comments are found outside strings, templates and regexes', () => {
  const src = [
    'const url = \'https://example.com\';',
    'const re = /\\/\\/[a-z/]+/g;',
    'const t = `a ${b /* inner */} // not a comment`;',
    'const half = total / 2; // trailing',
    '/* block',
    '   still block */',
    'return /x\\/y/.test(s);',
  ].join('\n');
  assert.deepEqual(findJsComments(src), [3, 4, 5]);
});

test('js shebang is not a comment', () => {
  assert.deepEqual(findJsComments('#!/usr/bin/env node\nconst a = 1;\n'), []);
});

test('css comments are found outside strings', () => {
  assert.deepEqual(findCssComments('a { content: "/* no */"; }\n/* yes */\nb {}'), [2]);
});

test('shell comments skip shebang, quotes, ${#var} and heredoc bodies', () => {
  const src = [
    '#!/bin/bash',
    'echo "# not" \'# not\' ${#arr[@]}',
    '# full line',
    'ls # trailing',
    'cat > f <<EOF',
    '# unit file content',
    'EOF',
    'grep x <<<"$1"',
    'echo done',
  ].join('\n');
  assert.deepEqual(findShellComments(src), [3, 4]);
});

test('html comments include embedded script and style', () => {
  const src = [
    '<!-- html -->',
    '<style>',
    'a { color: red; } /* css */',
    '</style>',
    '<script>',
    'const a = 1; // js',
    'const s = "<!-- not html -->";',
    '</script>',
  ].join('\n');
  assert.deepEqual(findHtmlComments(src), [1, 3, 6]);
});

test('source limits', () => {
  const longLine = 'x'.repeat(121);
  const rules = sourceViolations('src/a.mjs', `${longLine}\n// c\n`).map(v => v.rule);
  assert.deepEqual(rules, ['comments', 'line-length']);
  const tooLong = sourceViolations('src/a.mjs', 'a;\n'.repeat(301)).map(v => v.rule);
  assert.deepEqual(tooLong, ['file-length']);
  assert.deepEqual(sourceViolations('src/a.mjs', 'a;\n'.repeat(300)), []);
});

test('document names', () => {
  for (const ok of [
    'plan/PLAN-v1.0-architecture-refactor.md',
    'plan/PLAN-v2.13-x.vi.md',
    'docs/NOTES-v1.0-implementation-notes.md',
    'docs/assets/screenshots/desktop-git.png',
  ]) assert.equal(docNameViolation(ok), null, ok);
  for (const bad of [
    'plan/plan-v1.0-x.md',
    'plan/PLAN-1.0-x.md',
    'plan/NOTES-v1.0-x.md',
    'docs/PLAN-v1.0-x.md',
    'docs/ARCH-v1.0-Overview.md',
    'docs/ARCH-v1-x.md',
  ]) assert.ok(docNameViolation(bad), bad);
});

test('allowlist downgrades legacy violations and flags stale entries', () => {
  const violations = [
    { file: 'a.mjs', rule: 'comments' },
    { file: 'b.mjs', rule: 'comments' },
    { file: 'a.mjs', rule: 'syntax' },
  ];
  const { errors, warnings } = classify(violations, { 'a.mjs': ['comments', 'syntax', 'line-length'] });
  assert.deepEqual(warnings.map(v => v.file + v.rule), ['a.mjscomments']);
  assert.deepEqual(errors.map(v => v.file + v.rule), ['b.mjscomments', 'a.mjssyntax', 'a.mjsline-length']);
});

test('a class with base styles in two sheets is reported', () => {
  const sheets = [
    { file: 'public/css/pipelines.css', src: '.ci { display:grid; }' },
    { file: 'public/css/sessions.css', src: '.ci { opacity:.85; }\n.ci:hover { color:red; }' },
  ];
  const [violation, ...rest] = cssClassViolations(sheets);
  assert.equal(rest.length, 0);
  assert.equal(violation.file, 'public/css/sessions.css');
  assert.equal(violation.rule, 'css-class');
});

test('grouped rules, modifiers and responsive overrides are not ownership', () => {
  const sheets = [
    { file: 'public/css/base.css', src: '.btn { padding:0; }\n.ibtn { width:9px; }' },
    { file: 'public/css/topbar.css', src: '.btn:active, .ibtn:active { opacity:.9; }\n.btn.sm { height:1px; }' },
    { file: 'public/css/mobile.css', src: '@media (max-width:9px) { .btn { height:2px; } }' },
    { file: 'public/css/layout.css', src: '.statusbar { display:flex; }\n.statusbar .btn { gap:0; }' },
  ];
  assert.deepEqual(cssClassViolations(sheets), []);
});

test('a desktop-only class that another sheet also styles is reported', () => {
  const sheets = [
    { file: 'public/css/layout.css', src: '@media (min-width:900px) { .acts { flex-direction:column; } }' },
    { file: 'public/css/dialogs.css', src: 'dialog .acts { display:flex; }' },
  ];
  const [violation] = cssClassViolations(sheets);
  assert.equal(violation.file, 'public/css/layout.css');
  assert.match(violation.detail, /dialogs\.css/);
});
