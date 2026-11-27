import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SCRIPT = path.join(import.meta.dirname, '..', 'scripts', 'claude-statusline.mjs');
const PREVIOUS = { type: 'command', command: 'echo previous-line' };
const STATUS = {
  rate_limits: { five_hour: { used_percentage: 12, resets_at: 99 } },
  workspace: { current_dir: '/w' },
  context_window: { used_percentage: 40, context_window_size: 200000, total_input_tokens: 80000 },
  model: { display_name: 'Opus' },
  session_id: 's1',
};

function statusline(script, env, input) {
  return new Promise((resolve, reject) => {
    const done = (error, stdout) => (error ? reject(error) : resolve(stdout));
    const child = execFile(process.execPath, [script], { env }, done);
    child.stdin.end(input);
  });
}

async function sandbox(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'termi-statusline-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  await fs.mkdir(path.join(home, '.claude'));
  const settings = { statusLine: PREVIOUS, theme: 'dark' };
  await fs.writeFile(path.join(home, '.claude', 'settings.json'), JSON.stringify(settings));
  const data = path.join(home, 'data');
  return { home, data, env: { ...process.env, HOME: home, TERMI_DATA: data } };
}

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

test('install wraps the previous statusline and uninstall restores it', async t => {
  const { home, data, env } = await sandbox(t);
  const settingsFile = path.join(home, '.claude', 'settings.json');
  const first = await run(process.execPath, [SCRIPT, 'install'], { env });
  assert.match(first.stdout, /Đã cài statusline/);
  const installed = await readJson(settingsFile);
  assert.equal(installed.statusLine.command.endsWith(`"${path.join(data, 'claude-statusline.mjs')}"`), true);
  assert.equal(installed.theme, 'dark');
  assert.deepEqual(await readJson(path.join(data, 'statusline-next.json')), PREVIOUS);
  assert.match((await run(process.execPath, [SCRIPT, 'install'], { env })).stdout, /Đã cập nhật/);
  await run(process.execPath, [SCRIPT, 'uninstall'], { env });
  assert.deepEqual(await readJson(settingsFile), { statusLine: PREVIOUS, theme: 'dark' });
});

test('the installed copy records usage next to itself and forwards to the previous statusline', async t => {
  const { data, env } = await sandbox(t);
  await run(process.execPath, [SCRIPT, 'install'], { env });
  const installedCopy = path.join(data, 'claude-statusline.mjs');
  const runtimeEnv = { ...env, TERMI_DATA: '' };
  assert.equal(await statusline(installedCopy, runtimeEnv, JSON.stringify(STATUS)), 'previous-line\n');
  assert.equal(await statusline(installedCopy, runtimeEnv, 'not json'), 'previous-line\n');
  const usage = await readJson(path.join(data, 'claude-usage.json'));
  assert.equal(usage.rate_limits.five_hour.used_percentage, 12);
  assert.deepEqual(Object.keys(usage.sessions).sort(), ['/w', 's1']);
  assert.deepEqual({ ...usage.sessions.s1, at: 0 }, { pct: 40, size: 200000, tokens: 80000, model: 'Opus', at: 0 });
});
