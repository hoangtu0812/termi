import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { start } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';

let app;
let port;
let root;

before(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'termi-http-')));
  await fs.mkdir(path.join(root, 'data'));
  await fs.mkdir(path.join(root, 'work'));
  const config = loadConfig({
    TERMI_PORT: '0',
    TERMI_DATA: path.join(root, 'data'),
    TERMI_ROOTS: path.join(root, 'work'),
    TERMI_ALLOWED_USERS: 'owner@example.com',
  }, path.join(root, 'home'));
  app = await start({ ...config, port: 0 });
  port = app.server.address().port;
});

after(async () => {
  await app?.close();
  await fs.rm(root, { recursive: true, force: true });
});

function request(method, pathname, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, text, json: () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const post = (pathname, body, headers = {}) => request('POST', pathname, {
  headers: { 'content-type': 'application/json', 'x-termi': '1', ...headers },
  body: JSON.stringify(body),
});

test('read-only endpoints respond', async () => {
  for (const endpoint of ['/api/agents', '/api/history', '/api/projects', '/api/sessions', '/api/events']) {
    const res = await request('GET', endpoint);
    assert.equal(res.status, 200, endpoint);
    assert.ok(Array.isArray(res.json()), endpoint);
  }
  const dirs = (await request('GET', '/api/dirs')).json();
  assert.deepEqual(dirs.roots, [path.join(root, 'work')]);
  assert.equal((await request('GET', '/')).status, 200);
});

test('paths outside TERMI_ROOTS are refused', async () => {
  assert.equal((await request('GET', `/api/ls?dir=${encodeURIComponent(os.tmpdir())}`)).status, 403);
  const created = await post('/api/sessions', { name: 'probe', dir: os.tmpdir() });
  assert.equal(created.status, 403);
  const listed = await request('GET', `/api/ls?dir=${encodeURIComponent(path.join(root, 'work'))}`);
  assert.equal(listed.status, 200);
});

test('session creation validates the agent before touching tmux', async () => {
  const dir = path.join(root, 'work');
  assert.equal((await post('/api/sessions', { name: 'bad name', dir })).status, 400);
  assert.equal((await post('/api/sessions', { name: 'x', dir, agent: 'evil' })).status, 400);
  const resumeId = '11111111-1111-4111-8111-111111111111';
  const resume = await post('/api/sessions', { name: 'x', dir, agent: 'agy', resume: resumeId });
  assert.equal(resume.status, 400);
});

test('request guards', async () => {
  assert.equal((await request('GET', '/api/agents', { headers: { host: 'evil.com' } })).status, 421);
  const foreignOrigin = await request('GET', '/api/agents', { headers: { origin: 'https://evil.com' } });
  assert.equal(foreignOrigin.status, 403);
  const tailnet = { host: 'mac.tail1.ts.net' };
  assert.equal((await request('GET', '/api/agents', { headers: tailnet })).status, 403);
  const owner = { ...tailnet, 'tailscale-user-login': 'Owner@Example.com' };
  assert.equal((await request('GET', '/api/agents', { headers: owner })).status, 200);
  const json = { 'content-type': 'application/json' };
  const noHeader = await request('POST', '/api/restore/dismiss', { headers: json, body: '{}' });
  assert.equal(noHeader.status, 403);
  assert.equal((await request('GET', '/api/nope')).status, 404);
});
