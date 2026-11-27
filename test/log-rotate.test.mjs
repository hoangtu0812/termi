import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLogRotator, launchdLogFiles } from '../src/log-rotate.mjs';

test('logs over the limit are copied to .1 and emptied, small or missing logs are left alone', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'termi-log-'));
  const big = path.join(dir, 'big.log');
  const small = path.join(dir, 'small.log');
  await fs.writeFile(big, 'x'.repeat(100));
  await fs.writeFile(small, 'ok');
  const rotate = createLogRotator({ files: [big, small, path.join(dir, 'missing.log')], maxBytes: 50 });
  assert.deepEqual(await rotate(), [big]);
  assert.equal((await fs.stat(big)).size, 0);
  assert.equal((await fs.readFile(`${big}.1`, 'utf8')).length, 100);
  assert.equal(await fs.readFile(small, 'utf8'), 'ok');
  await fs.rm(dir, { recursive: true });
});

test('only macOS launchd logs are rotated by termi', () => {
  assert.deepEqual(launchdLogFiles('linux', '/home/a'), []);
  assert.deepEqual(launchdLogFiles('darwin', '/Users/a'), [
    '/Users/a/Library/Logs/termi.server.log',
    '/Users/a/Library/Logs/termi.ttyd.log',
  ]);
});
