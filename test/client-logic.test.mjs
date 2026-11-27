import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitDiffRows } from '../public/js/diff.mjs';
import { graphSvg } from '../public/js/git-graph.mjs';
import { trackingState } from '../public/js/git.mjs';
import { fold, matchPalette } from '../public/js/palette.mjs';
import { contextPercent } from '../public/js/usage.mjs';

test('two-column diff rows pair removed and added lines', () => {
  const diff = [
    'diff --git a/src/a.js b/src/a.js',
    'index 1..2 100644',
    '--- a/src/a.js',
    '+++ b/src/a.js',
    '@@ -1,3 +1,3 @@',
    ' same',
    '-old one',
    '-old two',
    '+new one',
    ' tail',
  ].join('\n');
  assert.deepEqual(splitDiffRows(diff), [
    ['file', 'src/a.js'],
    ['hunk', '@@ -1,3 +1,3 @@'],
    ['ctx', 'same', 'same'],
    ['chg', 'old one', 'new one'],
    ['chg', 'old two', null],
    ['ctx', 'tail', 'tail'],
  ]);
});

test('upstream tracking chip', () => {
  assert.deepEqual(trackingState(''), { cls: '', text: 'chưa có upstream', title: 'Nhánh chưa liên kết với remote' });
  assert.equal(trackingState('origin/main').text, '✓ đồng bộ');
  assert.equal(trackingState('origin/main').cls, ' synced');
  assert.deepEqual(trackingState('origin/main [ahead 1, behind 2]'), {
    cls: ' behind',
    text: '↑1 ↓2',
    title: '1 commit chưa push · 2 commit chưa pull',
  });
  assert.equal(trackingState('origin/main [ahead 3]').cls, ' ahead');
  assert.equal(trackingState('origin/gone [gone]').text, 'upstream đã mất');
});

test('commit graph rows are drawn from numbers only', () => {
  const commit = { refs: ['HEAD -> main'], p: ['a'] };
  const svg = graphSvg(commit, { col: 1, seg: [[0, 0, 0, 2], [1, 1, 1, 2]] }, 2);
  assert.match(svg, /^<svg width="38" height="56" viewBox="0 0 38 56" aria-hidden="true">/);
  assert.equal((svg.match(/<path /g) || []).length, 2);
  assert.match(svg, /<circle cx="26" cy="28" r="6" fill="#4fbf7f" stroke="var\(--bg\)" stroke-width="2"\/>/);
  const merge = graphSvg({ refs: [], p: ['a', 'b'] }, { col: 0, seg: [] }, 30);
  assert.match(merge, /width="150"/);
  assert.match(merge, /r="5" fill="var\(--bg\)"/);
});

test('palette search ignores Vietnamese accents and case', () => {
  assert.equal(fold('Đăng Nhập'), 'dang nhap');
  const items = [
    { label: 'Đăng nhập', hint: 'Lệnh' },
    { label: 'beta', hint: 'Phiên · work' },
  ];
  assert.deepEqual(matchPalette(items, 'dang nhap').map(it => it.label), ['Đăng nhập']);
  assert.deepEqual(matchPalette(items, 'PHIEN work').map(it => it.label), ['beta']);
  assert.equal(matchPalette(items, '').length, 2);
  assert.equal(matchPalette(Array.from({ length: 60 }, () => items[1]), 'beta').length, 40);
});

test('context usage percentage', () => {
  assert.equal(contextPercent({ pct: 41.6 }), 42);
  assert.equal(contextPercent({ context: 50_000, window: 200_000 }), 25);
  assert.equal(contextPercent({ context: 50_000 }), null);
});
