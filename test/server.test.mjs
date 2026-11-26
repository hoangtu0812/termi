import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validName, validRev, validHost, validBranch, safeDir, safePath, agentState, AGENTS, parseStatus, graphLayout } from '../src/server.mjs';

test('trạng thái agent', () => {
  assert.equal(agentState('✻ Thinking… (12s · esc to interrupt)\n❯ \n'), 'working');
  assert.equal(agentState('Bash command\n rm x\nDo you want to proceed?\n❯ 1. Yes\n  2. No\nEsc to cancel'), 'waiting');
  assert.equal(agentState('───\n❯ Try "how do I log an error?"\n'), 'idle');
  // Codex
  assert.equal(agentState('• Working (4s • esc to interrupt)\n› '), 'working');
  assert.equal(agentState('Trust this folder?\n› 1. Trust and continue\n  2. Back\n  enter continue · esc back'), 'waiting');
  assert.equal(agentState('Would you like to run the following command?\n$ rm -rf build\n› 1. Yes, proceed\nPress enter to confirm or esc to cancel'), 'waiting');
});

test('nhận ra tiến trình agent', () => {
  const who = c => Object.keys(AGENTS).find(id => AGENTS[id].proc(c));
  assert.equal(who('/Users/a/.local/share/claude/versions/2.1.332'), 'claude');
  assert.equal(who('/Users/a/.local/bin/codex'), 'codex');
  assert.equal(who('/opt/homebrew/bin/agy'), 'agy');
  assert.equal(who('/Applications/Claude.app/Contents/MacOS/Claude'), undefined);
  assert.equal(who('/bin/zsh'), undefined);
});

test('git status -z', () => {
  const r = parseStatus('## main...origin/main [ahead 1]\0M  a b.txt\0R  new.js\0old.js\0?? x\0');
  assert.equal(r.head, 'main...origin/main [ahead 1]');
  assert.deepEqual(r.files.map(f => f.x + f.y + f.path), ['M a b.txt', 'R new.js', '??x']);
});

test('tên branch', () => {
  for (const ok of ['main', 'feat/x-1', 'origin/dev']) assert.ok(validBranch(ok), ok);
  for (const bad of ['-f', '--force', 'a..b', 'a b', '']) assert.ok(!validBranch(bad), bad);
});

test('safePath file', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'termi-')));
  await fs.writeFile(path.join(root, 'f.txt'), 'x');
  assert.equal(await safePath(path.join(root, 'f.txt'), 'file', [root]), path.join(root, 'f.txt'));
  assert.equal(await safePath(root, 'file', [root]), null);
  assert.equal(await safePath('/etc/hosts', 'file', [root]), null);
});

test('tên phiên', () => {
  for (const ok of ['main', 'my-proj_2']) assert.ok(validName(ok), ok);
  for (const bad of ['', 'a b', 'x;rm', 'a:b', 'a.b', '-'.repeat(41), 1]) assert.ok(!validName(bad), String(bad));
});

test('mã commit', () => {
  assert.ok(validRev('abc1234'));
  for (const bad of ['HEAD', '--output=x', 'abc', 'abc123g']) assert.ok(!validRev(bad), bad);
});

test('host', () => {
  for (const ok of ['localhost:7680', '127.0.0.1', 'tus-mac-mini.tail1234.ts.net']) assert.ok(validHost(ok), ok);
  for (const bad of ['evil.com', 'ts.net.evil.com', 'a.ts.net.evil.com:80', undefined]) assert.ok(!validHost(bad), String(bad));
});

test('thư mục nằm trong roots', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'termi-')));
  await fs.mkdir(path.join(root, 'a'));
  await fs.mkdir(`${root}-evil`);
  assert.equal(await safeDir(path.join(root, 'a'), [root]), path.join(root, 'a'));
  assert.equal(await safeDir(path.join(root, 'a', '..', '..'), [root]), null);
  assert.equal(await safeDir(`${root}-evil`, [root]), null); // tiền tố trùng nhưng khác thư mục
  assert.equal(await safeDir(path.join(root, 'none'), [root]), null);
  await fs.symlink('/', path.join(root, 'link'));
  assert.equal(await safeDir(path.join(root, 'link'), [root]), null); // symlink thoát ra ngoài
});

test('xếp làn cây commit: rẽ nhánh rồi merge', () => {
  // M merge A và B, cả hai cùng gốc C
  const g = graphLayout([
    { h: 'M', p: ['A', 'B'] }, { h: 'A', p: ['C'] }, { h: 'B', p: ['C'] }, { h: 'C', p: [] },
  ]);
  assert.equal(g.width, 2);
  assert.deepEqual(g.rows.map(r => r.col), [0, 0, 1, 0]);
  assert.deepEqual(g.rows[0].seg, [[0, 1, 0, 2], [0, 1, 1, 2]]);             // M tách ra 2 làn
  assert.deepEqual(g.rows[1].seg, [[0, 0, 0, 1], [0, 1, 0, 2], [1, 0, 1, 2]]); // A thẳng, làn B chạy qua
  assert.deepEqual(g.rows[2].seg, [[1, 0, 1, 1], [1, 1, 0, 2], [0, 0, 0, 2]]); // B nhập về làn của C
  assert.deepEqual(g.rows[3].seg, [[0, 0, 0, 1]]);                           // C là gốc, không đi tiếp
});

test('index.html: không có </script> lọt trong code JS (sẽ cắt ngang thẻ script)', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.equal(html.match(/<\/script>/gi).length, html.match(/^<script[\s>]/gim).length); // thẻ thật đứng đầu dòng
});
