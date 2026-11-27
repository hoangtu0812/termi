import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  safeDir, safePath, validBranch, validGitPath, validHost, validKey, validName, validRev, validTime, validUuid,
} from '../src/validate.mjs';

async function tempRoot(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'termi-root-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  t.after(() => fs.rm(`${root}-evil`, { recursive: true, force: true }));
  return root;
}

test('session names', () => {
  for (const ok of ['main', 'my-proj_2', 'x'.repeat(40)]) assert.ok(validName(ok), ok);
  for (const bad of ['', 'a b', 'x;rm', 'a:b', 'a.b', 'x'.repeat(41), 1, null]) assert.ok(!validName(bad), String(bad));
});

test('commit hashes', () => {
  for (const ok of ['abc1234', 'deadbeef', 'a'.repeat(40)]) assert.ok(validRev(ok), ok);
  for (const bad of ['HEAD', '--output=x', 'abc', 'abc123g', 'ABC1234', 'a'.repeat(41)]) assert.ok(!validRev(bad), bad);
});

test('conversation ids', () => {
  assert.ok(validUuid('123e4567-e89b-12d3-a456-426614174000'));
  for (const bad of ['123E4567-e89b-12d3-a456-426614174000', '123e4567e89b12d3a456426614174000', '', undefined]) {
    assert.ok(!validUuid(bad), String(bad));
  }
});

test('branch names', () => {
  for (const ok of ['main', 'feat/x-1', 'origin/dev', 'v1.2']) assert.ok(validBranch(ok), ok);
  for (const bad of ['-f', '--force', 'a..b', 'a b', '', 'x'.repeat(201), 7]) assert.ok(!validBranch(bad), String(bad));
});

test('git paths', () => {
  for (const ok of ['a.txt', 'dir/with space.md', 'x'.repeat(4095)]) assert.ok(validGitPath(ok));
  for (const bad of ['', 'a\0b', 'x'.repeat(4096), null]) assert.ok(!validGitPath(bad));
});

test('hosts accepted against DNS rebinding', () => {
  for (const ok of ['localhost:7680', '127.0.0.1', 'tus-mac-mini.tail1234.ts.net', 'A.B.TS.NET:443']) {
    assert.ok(validHost(ok), ok);
  }
  for (const bad of ['evil.com', 'ts.net.evil.com', 'a.ts.net.evil.com:80', 'a.b.c.ts.net', undefined]) {
    assert.ok(!validHost(bad), String(bad));
  }
});

test('quiet-hours clock times', () => {
  for (const ok of ['00:00', '07:30', '23:59']) assert.ok(validTime(ok), ok);
  for (const bad of ['24:00', '7:30', '12:60', '', null]) assert.ok(!validTime(bad), String(bad));
});

test('keys that may be sent to a session', () => {
  for (const ok of ['Escape', 'C-c', 'BTab', 'Enter', '1', '9']) assert.ok(validKey(ok), ok);
  for (const bad of ['0', '10', 'C-z', 'q', 'enter', '']) assert.ok(!validKey(bad), bad);
});

test('safePath accepts files inside the roots only', async t => {
  const root = await tempRoot(t);
  await fs.writeFile(path.join(root, 'f.txt'), 'x');
  assert.equal(await safePath(path.join(root, 'f.txt'), 'file', [root]), path.join(root, 'f.txt'));
  assert.equal(await safePath(root, 'file', [root]), null);
  assert.equal(await safePath('/etc/hosts', 'file', [root]), null);
  assert.equal(await safePath('', 'file', [root]), null);
});

test('safeDir rejects traversal, sibling prefixes and escaping symlinks', async t => {
  const root = await tempRoot(t);
  await fs.mkdir(path.join(root, 'a'));
  await fs.mkdir(`${root}-evil`);
  await fs.symlink('/', path.join(root, 'link'));
  assert.equal(await safeDir(path.join(root, 'a'), [root]), path.join(root, 'a'));
  assert.equal(await safeDir(root, [root]), root);
  assert.equal(await safeDir(path.join(root, 'a', '..', '..'), [root]), null);
  assert.equal(await safeDir(`${root}-evil`, [root]), null);
  assert.equal(await safeDir(path.join(root, 'none'), [root]), null);
  assert.equal(await safeDir(path.join(root, 'link'), [root]), null);
});
