import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer } from './helpers/server.mjs';

const ID = '11111111-2222-3333-4444-555555555555';
let app;

before(async () => {
  app = await startTestServer();
  const project = path.join(app.root, 'home', '.claude', 'projects', app.work.replace(/[^A-Za-z0-9]/g, '-'));
  await fs.mkdir(project, { recursive: true });
  const lines = [
    { type: 'user', cwd: app.work, message: { content: 'sửa lỗi đăng nhập' }, timestamp: '2026-11-27T01:00:00Z' },
    { type: 'assistant', message: { content: [
      { type: 'text', text: 'Để tôi xem.' },
      { type: 'tool_use', name: 'Edit', input: { file_path: path.join(app.work, 'a.mjs') } },
    ] }, timestamp: '2026-11-27T01:00:05Z' },
  ];
  await fs.writeFile(path.join(project, `${ID}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n') + '\n');
});

after(() => app?.stop());

test('an old conversation can be read back without opening a session', async () => {
  const data = (await app.get(`/api/conversation?id=${ID}`)).json();
  assert.equal(data.agent, 'claude');
  assert.equal(data.title, 'sửa lỗi đăng nhập');
  assert.equal(data.cwd, app.work);
  assert.deepEqual(data.items.map(item => item.kind), ['msg', 'msg', 'tools']);
  assert.equal(data.items[2].steps[0].file, path.join(app.work, 'a.mjs'));
});

test('conversation ids are validated and unknown ones are 404', async () => {
  assert.equal((await app.get('/api/conversation?id=../../etc')).status, 400);
  assert.equal((await app.get('/api/conversation?id=99999999-2222-3333-4444-555555555555')).status, 404);
});
