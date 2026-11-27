import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cachedJsonFile } from '../src/agents/jsonl.mjs';
import { sharedResult } from '../src/shared-result.mjs';
import { groupPanes } from '../src/sessions.mjs';

function deferredBuilds() {
  const pending = [];
  const build = () => new Promise(resolve => pending.push(resolve));
  return { build, pending };
}

test('concurrent callers share one build', async () => {
  const { build, pending } = deferredBuilds();
  const shared = sharedResult(build, { ttlMs: 1000, now: () => 0 });
  const calls = [shared.get(), shared.get(), shared.get()];
  assert.equal(pending.length, 1);
  pending[0]('list');
  assert.deepEqual(await Promise.all(calls), ['list', 'list', 'list']);
});

test('a result is reused until it expires', async () => {
  let clock = 0;
  let builds = 0;
  const shared = sharedResult(async () => ++builds, { ttlMs: 1000, now: () => clock });
  assert.equal(await shared.get(), 1);
  clock = 999;
  assert.equal(await shared.get(), 1);
  clock = 1000;
  assert.equal(await shared.get(), 2);
});

test('invalidate forces a new build, even while one is running', async () => {
  const { build, pending } = deferredBuilds();
  const shared = sharedResult(build, { ttlMs: 1000, now: () => 0 });
  const stale = shared.get();
  shared.invalidate();
  const fresh = shared.get();
  assert.equal(pending.length, 2);
  pending[0]('old');
  pending[1]('new');
  assert.equal(await stale, 'old');
  assert.equal(await fresh, 'new');
  assert.equal(await shared.get(), 'new');
  assert.equal(pending.length, 2);
});

test('a failed build is not cached', async () => {
  let attempt = 0;
  const shared = sharedResult(async () => {
    attempt++;
    if (attempt === 1) throw new Error('tmux busy');
    return 'ok';
  }, { ttlMs: 1000, now: () => 0 });
  await assert.rejects(shared.get(), /tmux busy/);
  assert.equal(await shared.get(), 'ok');
});

test('a JSON file is parsed again only after it changes', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'termi-json-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'usage.json');
  const read = cachedJsonFile(file);
  assert.equal(await read(), null);
  await fs.writeFile(file, '{"a":1}');
  const first = await read();
  assert.deepEqual(first, { a: 1 });
  assert.equal(await read(), first);
  await fs.writeFile(`${file}.tmp`, '{"a":22}');
  await fs.rename(`${file}.tmp`, file);
  assert.deepEqual(await read(), { a: 22 });
  await fs.rm(file);
  assert.equal(await read(), null);
});

test('panes are grouped into sessions', () => {
  const line = (...fields) => fields.join('\t');
  const lines = [
    line('api', '01', '10', '/old', '0', '100', '90'),
    line('api', '11', '11', '/work/api', '0', '100', '95'),
    line('web', '11', '20', '/work/web', '1', '200', '199'),
  ];
  const owners = new Map([['10', { agent: 'claude', agentPid: '12' }]]);
  assert.deepEqual(groupPanes(lines, owners), [
    { name: 'web', dir: '/work/web', attached: true, activity: 200, agent: null, output: 199 },
    { name: 'api', dir: '/work/api', attached: false, activity: 100, agent: 'claude', agentPid: '12', output: 95 },
  ]);
});
