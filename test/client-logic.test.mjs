import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitDiffRows } from '../public/js/diff.mjs';
import { graphSvg } from '../public/js/git-graph.mjs';
import { authorHue, passingLanesSvg } from '../public/js/git-graph.mjs';
import { dayLabel } from '../public/js/git-log.mjs';
import { changedRange } from '../public/js/diff.mjs';
import { crumbParts } from '../public/js/file-crumb.mjs';
import { lineCount } from '../public/js/highlight.mjs';
import { trackingState } from '../public/js/git.mjs';
import { fold, matchPalette } from '../public/js/palette.mjs';
import { contextPercent } from '../public/js/usage.mjs';
import {
  activeFilter,
  countByKind,
  matchesFilter,
  midTrunc,
  sessionLabel,
} from '../public/js/session-label.mjs';

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

test('long session names keep the distinguishing tail', () => {
  const dir = '/code/BSR-Digital-Operations-Platform';
  assert.equal(sessionLabel({ name: 'BSR-Digital-Operations-Platform-3', dir }), 'BSR-Digi…-3');
  assert.equal(sessionLabel({ name: 'termi', dir: '/code/termi' }), 'termi');
  assert.equal(sessionLabel({ name: 'x', dir, title: 'Sửa lỗi đăng nhập' }), 'Sửa lỗi đăng nhập');
  assert.equal(midTrunc('abcdefghijklmnopqrstuvwxyz', 10), 'abcde…vwxyz');
  assert.equal(midTrunc('short', 10), 'short');
});

test('session filter counts states and falls back to all', () => {
  const list = [{ state: 'waiting' }, { state: 'working' }, { state: 'idle' }, { state: 'shell' }];
  const counts = countByKind(list);
  assert.deepEqual(counts, { waiting: 1, working: 1, idle: 2 });
  assert.equal(activeFilter('working', counts), 'working');
  assert.equal(activeFilter('waiting', { ...counts, waiting: 0 }), 'all');
  assert.equal(matchesFilter({ state: 'shell' }, 'idle'), true);
  assert.equal(matchesFilter({ state: 'shell' }, 'working'), false);
  assert.equal(matchesFilter({ state: 'shell' }, 'all'), true);
});

test('commit days are labelled relative to today', () => {
  const now = new Date(2026, 10, 27, 9).getTime();
  assert.equal(dayLabel(new Date(2026, 10, 27, 1).getTime(), now), 'Hôm nay');
  assert.equal(dayLabel(new Date(2026, 10, 26, 23).getTime(), now), 'Hôm qua');
  assert.match(dayLabel(new Date(2026, 10, 20).getTime(), now), /20\/11/);
  assert.match(dayLabel(new Date(2025, 10, 20).getTime(), now), /2025/);
});

test('day rows continue only the lanes that pass through', () => {
  const svg = passingLanesSvg({ seg: [[0, 0, 0, 1], [1, 0, 1, 2], [1, 1, 2, 2]] }, 3);
  assert.equal(svg.match(/<path/g).length, 2);
  assert.equal(authorHue('tuph'), authorHue('tuph'));
  assert.ok(authorHue('tuph') >= 0 && authorHue('tuph') < 360);
});

test('changed range trims the shared head and tail of a line pair', () => {
  assert.deepEqual(changedRange('const a = 1;', 'const a = 2;'), { head: 10, tail: 1 });
  assert.deepEqual(changedRange('abc', 'abd'), { head: 2, tail: 0 });
  assert.equal(changedRange('completely different', 'nothing alike here'), null);
});

test('breadcrumb keeps home and the last three levels', () => {
  assert.deepEqual(crumbParts('/Users/a/code/termi'), [['~', '/Users/a'], ['code', '/Users/a/code'],
    ['termi', '/Users/a/code/termi']]);
  const deep = crumbParts('/Volumes/Disk/p/q/r/s');
  assert.deepEqual(deep.map(([label]) => label), ['…', 'q', 'r', 's']);
  assert.equal(deep[0][1], '/Volumes/Disk/p');
});

test('line numbers ignore the final newline', () => {
  assert.equal(lineCount('a\nb\n'), 2);
  assert.equal(lineCount('a'), 1);
});
