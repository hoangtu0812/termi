import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { graphLayout } from '../src/git/graph.mjs';
import { GIT_OPS } from '../src/git/ops.mjs';
import { LOG_FORMAT, marksFromStatus, parseLog, parseNumstat, parseStatus } from '../src/git/parse.mjs';
import { git } from '../src/git/run.mjs';

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
});

async function tempRepo(t) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'termi-repo-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await git(dir, 'init', '-q', '-b', 'main');
  return dir;
}

test('git status -z with renames', () => {
  const status = parseStatus('## main...origin/main [ahead 1]\0M  a b.txt\0R  new.js\0old.js\0?? x\0');
  assert.equal(status.head, 'main...origin/main [ahead 1]');
  assert.deepEqual(status.files.map(f => f.x + f.y + f.path), ['M a b.txt', 'R new.js', '??x']);
  assert.deepEqual(parseStatus(''), { head: '', files: [] });
});

test('git --numstat with binary files and tabs in paths', () => {
  assert.deepEqual(parseNumstat('12\t3\tsrc/a.js\n-\t-\tlogo.png\n1\t0\ta\tb\n'), [
    { path: 'src/a.js', add: 12, del: 3 },
    { path: 'logo.png', add: null, del: null },
    { path: 'a\tb', add: 1, del: 0 },
  ]);
});

test('git log in LOG_FORMAT', () => {
  const raw = [
    ['abc', 'p1 p2', 'HEAD -> main, tag: v1', 'subject', 'me', '10'].join('\x1f'),
    ['p1', '', '', 'root', 'me', '5'].join('\x1f'),
    '',
  ].join('\n');
  assert.deepEqual(parseLog(raw), [
    { h: 'abc', p: ['p1', 'p2'], refs: ['HEAD -> main', 'tag: v1'], s: 'subject', a: 'me', t: 10_000 },
    { h: 'p1', p: [], refs: [], s: 'root', a: 'me', t: 5000 },
  ]);
  assert.equal(LOG_FORMAT, '%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%at');
});

test('git marks for the File tab', () => {
  const raw = ' M src/server.mjs\0?? docs/new.md\0A  README.md\0M  src/sub/deep.js\0';
  assert.deepEqual(Object.fromEntries(marksFromStatus(raw, '')), { src: '•', docs: '•', 'README.md': 'A' });
  assert.deepEqual(Object.fromEntries(marksFromStatus(raw, 'src')), { 'server.mjs': 'M', sub: '•' });
  assert.deepEqual(Object.fromEntries(marksFromStatus('?? newdir/\0', '')), { newdir: 'U' });
});

test('commit graph: branch then merge', () => {
  const graph = graphLayout([
    { h: 'M', p: ['A', 'B'] },
    { h: 'A', p: ['C'] },
    { h: 'B', p: ['C'] },
    { h: 'C', p: [] },
  ]);
  assert.equal(graph.width, 2);
  assert.deepEqual(graph.rows.map(r => r.col), [0, 0, 1, 0]);
  assert.deepEqual(graph.rows[0].seg, [[0, 1, 0, 2], [0, 1, 1, 2]]);
  assert.deepEqual(graph.rows[1].seg, [[0, 0, 0, 1], [0, 1, 0, 2], [1, 0, 1, 2]]);
  assert.deepEqual(graph.rows[2].seg, [[1, 0, 1, 1], [1, 1, 0, 2], [0, 0, 0, 2]]);
  assert.deepEqual(graph.rows[3].seg, [[0, 0, 0, 1]]);
});

test('commit graph: a second branch tip opens a new lane', () => {
  const graph = graphLayout([{ h: 'X', p: ['C'] }, { h: 'Y', p: ['C'] }, { h: 'C', p: [] }]);
  assert.deepEqual(graph.rows.map(r => r.col), [0, 1, 0]);
  assert.equal(graph.width, 2);
});

test('stage, unstage before the first commit, commit', async t => {
  const dir = await tempRepo(t);
  await fs.writeFile(path.join(dir, 'a.txt'), 'a');
  await GIT_OPS.stage(dir, { paths: ['a.txt'] });
  assert.match(await git(dir, 'status', '--porcelain'), /^A {2}a\.txt/);
  await GIT_OPS.unstage(dir, { paths: ['a.txt'] });
  assert.match(await git(dir, 'status', '--porcelain'), /^\?\? a\.txt/);
  await GIT_OPS.stage(dir, { paths: ['a.txt'] });
  await GIT_OPS.commit(dir, { message: 'first' });
  assert.equal((await git(dir, 'log', '--format=%s')).trim(), 'first');
});

test('git operations reject bad input before running git', async t => {
  const dir = await tempRepo(t);
  assert.throws(() => GIT_OPS.stage(dir, { paths: [] }), { status: 400 });
  assert.throws(() => GIT_OPS.stage(dir, { paths: ['a\0b'] }), { status: 400 });
  assert.throws(() => GIT_OPS.commit(dir, { message: '   ' }), { status: 400 });
  assert.throws(() => GIT_OPS.checkout(dir, { branch: '--orphan' }), { status: 400 });
  await assert.rejects(GIT_OPS.unstage(dir, { paths: 'a.txt' }), { status: 400 });
});

test('git errors become 400 with git’s message', async t => {
  const dir = await tempRepo(t);
  await assert.rejects(GIT_OPS.checkout(dir, { branch: 'missing' }), error => {
    assert.equal(error.status, 400);
    assert.match(error.message, /missing/);
    return true;
  });
});
