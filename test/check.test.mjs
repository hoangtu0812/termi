import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findJsComments, findCssComments, findShellComments, findHtmlComments,
} from '../scripts/check-comments.mjs';
import { sourceViolations, docNameViolation, classify } from '../scripts/check.mjs';

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
