import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from '../src/config.mjs';
import { init, normalizeSnapshot } from '../src/app.mjs';

const run = promisify(execFile);
const SRC = path.join(import.meta.dirname, '..', 'src');
const LIBRARY_MODULES = ['app.mjs', 'config.mjs', 'store.mjs'];

async function tempDir(t, prefix) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('importing a module has no side effects', async t => {
  const home = await tempDir(t, 'termi-home-');
  for (const file of LIBRARY_MODULES) {
    const url = new URL(`file://${path.join(SRC, file)}`).href;
    await run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`], {
      env: { ...process.env, HOME: home, TERMI_DATA: '', TERMI_ROOTS: '' },
      timeout: 10_000,
    });
  }
  assert.deepEqual(await fs.readdir(home), []);
});

test('config reads the environment', () => {
  const config = loadConfig({
    TERMI_PORT: '7690',
    TERMI_TTYD_PORT: '7691',
    TERMI_DATA: 'data',
    TERMI_ROOTS: '/a: /b:',
    TERMI_ALLOWED_USERS: 'A@x.com, b@y.com',
  }, '/home/u');
  assert.equal(config.port, 7690);
  assert.equal(config.ttydPort, 7691);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.dataDir, path.resolve('data'));
  assert.deepEqual(config.roots, ['/a', '/b']);
  assert.deepEqual(config.allowedUsers, ['a@x.com', 'b@y.com']);
});

test('config defaults', () => {
  const config = loadConfig({}, '/home/u');
  assert.equal(config.port, 7680);
  assert.equal(config.ttydPort, 7681);
  assert.equal(config.dataDir, '/home/u/.termi');
  assert.deepEqual(config.roots, ['/home/u']);
  assert.equal(config.tailscale, 'tailscale');
  assert.equal(config.allowedUsers, null);
});

test('init prepares the data directory and keeps the same VAPID key', async t => {
  const dataDir = await tempDir(t, 'termi-data-');
  const config = loadConfig({ TERMI_DATA: dataDir, TERMI_ROOTS: dataDir });
  await init(config);
  assert.equal((await fs.stat(dataDir)).mode & 0o777, 0o700);
  assert.ok((await fs.stat(path.join(dataDir, 'uploads'))).isDirectory());
  const first = await fs.readFile(path.join(dataDir, 'vapid.json'), 'utf8');
  await init(config);
  assert.equal(await fs.readFile(path.join(dataDir, 'vapid.json'), 'utf8'), first);
});

test('init refuses a corrupt VAPID key instead of replacing it', async t => {
  const dataDir = await tempDir(t, 'termi-data-');
  await fs.writeFile(path.join(dataDir, 'vapid.json'), '{"pub":');
  await assert.rejects(init(loadConfig({ TERMI_DATA: dataDir, TERMI_ROOTS: dataDir })), /vapid\.json/);
  assert.equal(await fs.readFile(path.join(dataDir, 'vapid.json'), 'utf8'), '{"pub":');
});

test('snapshot normalization', () => {
  assert.deepEqual(normalizeSnapshot(null), { at: 0, sessions: [], pending: [] });
  assert.deepEqual(normalizeSnapshot({ at: 5, sessions: 'x', pending: [{ name: 'a' }] }),
    { at: 5, sessions: [], pending: [{ name: 'a' }] });
});
