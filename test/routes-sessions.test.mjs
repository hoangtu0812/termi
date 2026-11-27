import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hasTmux, startTestServer } from './helpers/server.mjs';

let app;
let tmuxAvailable;

before(async () => {
  app = await startTestServer();
  tmuxAvailable = await hasTmux();
});

after(() => app?.stop());

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function eventually(check, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await wait(100);
  }
  return false;
}

const sessionNamed = async name => (await app.get('/api/sessions')).json().find(s => s.name === name);

test('read-only endpoints respond', async () => {
  for (const endpoint of ['/api/agents', '/api/history', '/api/projects', '/api/sessions', '/api/events']) {
    const res = await app.get(endpoint);
    assert.equal(res.status, 200, endpoint);
    assert.ok(Array.isArray(res.json()), endpoint);
  }
  assert.deepEqual((await app.get('/api/dirs')).json().roots, [app.work]);
  assert.deepEqual((await app.get(`/api/history?dir=${encodeURIComponent(app.work)}`)).json(), []);
  assert.deepEqual((await app.get('/api/restore')).json(), []);
});

test('session requests are validated before touching tmux', async () => {
  const dir = app.work;
  assert.equal((await app.post('/api/sessions', { name: 'bad name', dir })).status, 400);
  assert.equal((await app.post('/api/sessions', { name: 'x', dir, agent: 'evil' })).status, 400);
  const resume = { name: 'x', dir, agent: 'agy', resume: '11111111-1111-4111-8111-111111111111' };
  assert.equal((await app.post('/api/sessions', resume)).status, 400);
  assert.equal((await app.post('/api/sessions', { name: 'x', dir, resume: 'nope' })).status, 400);
  assert.equal((await app.post('/api/sessions', { name: 'probe', dir: os.tmpdir() })).status, 403);
  assert.equal((await app.post('/api/sessions/rename', { name: 'a', to: 'b c' })).status, 400);
  assert.equal((await app.post('/api/sessions/kill', { name: '' })).status, 400);
  assert.equal((await app.post('/api/send', { session: 'a b' })).status, 400);
  assert.equal((await app.post('/api/send', { session: 'a', key: 'rm' })).status, 400);
  assert.equal((await app.post('/api/send', { session: 'a', text: 'x'.repeat(20_001) })).status, 413);
  assert.equal((await app.post('/api/resize', { session: 'a', cols: 5, rows: 20 })).status, 400);
  assert.equal((await app.post('/api/resize', { session: 'a', cols: 80.5, rows: 20 })).status, 400);
  assert.equal((await app.post('/api/refresh', { session: '-' + 'x'.repeat(80) })).status, 400);
  assert.equal((await app.post('/api/menu-submit', { session: 'a/b' })).status, 400);
  assert.equal((await app.get('/api/capture?session=a%20b')).status, 400);
  assert.equal((await app.get('/api/chat')).status, 400);
});

test('session lifecycle in tmux', async t => {
  if (!tmuxAvailable) return t.skip('tmux is not installed');
  assert.deepEqual((await app.post('/api/sessions', { name: 'alpha', dir: app.work })).json(), { ok: true });
  assert.equal((await app.post('/api/sessions', { name: 'alpha', dir: app.work })).status, 409);
  assert.ok(await eventually(async () => (await sessionNamed('alpha')).dir === app.work));
  const alpha = await sessionNamed('alpha');
  assert.equal(alpha.state, 'shell');
  assert.equal(alpha.agent, null);
  assert.equal(alpha.changes, null);
  assert.equal(typeof alpha.since, 'number');

  await app.post('/api/send', { session: 'alpha', text: 'echo termi-$((40+2))', enter: true });
  const captured = async () => (await app.get('/api/capture?session=alpha')).json().text;
  assert.ok(await eventually(async () => (await captured()).includes('termi-42')));
  assert.deepEqual((await app.post('/api/send', { session: 'alpha', key: 'C-c' })).json(), { ok: true });
  assert.deepEqual((await app.post('/api/resize', { session: 'alpha', cols: 100, rows: 30 })).json(), { ok: true });
  assert.deepEqual((await app.post('/api/refresh', { session: 'alpha' })).json(), { ok: true });
  assert.deepEqual((await app.get('/api/chat?session=alpha')).json(), { agent: null, state: 'shell', items: [] });
  assert.equal((await app.get('/api/capture?session=nobody')).status, 404);
  assert.equal((await app.get('/api/chat?session=nobody')).status, 404);

});

test('session usage, projects, rename and kill', async t => {
  if (!tmuxAvailable) return t.skip('tmux is not installed');
  const usage = (await app.get('/api/usage?session=alpha')).json();
  assert.equal(usage.session.name, 'alpha');
  assert.equal(usage.session.agent, null);
  assert.equal((await app.get('/api/usage?session=nobody')).json().session, null);
  const burst = await Promise.all([1, 2, 3].map(() => app.get('/api/sessions').then(res => res.json())));
  assert.deepEqual(burst[1], burst[0]);
  assert.deepEqual(burst[2], burst[0]);

  const projects = (await app.get('/api/projects')).json();
  assert.deepEqual(projects.map(p => [p.dir, p.sessions]), [[app.work, ['alpha']]]);
  assert.ok((await app.get('/api/dirs')).json().recent.includes(app.work));

  assert.deepEqual((await app.post('/api/sessions', { name: 'other', dir: app.work })).json(), { ok: true });
  assert.equal((await app.post('/api/sessions/rename', { name: 'alpha', to: 'other' })).status, 409);
  assert.deepEqual((await app.post('/api/sessions/rename', { name: 'alpha', to: 'beta' })).json(), { ok: true });
  assert.ok(await sessionNamed('beta'));
  assert.deepEqual((await app.post('/api/sessions/kill', { name: 'beta' })).json(), { ok: true });
  assert.equal((await app.post('/api/sessions/kill', { name: 'beta' })).status, 404);
  assert.equal(await sessionNamed('beta'), undefined);
});

test('sessions lost in a tmux restart are offered for restore', async t => {
  if (!tmuxAvailable) return t.skip('tmux is not installed');
  const saved = { at: 1, sessions: [{ name: 'gamma', dir: app.work, agent: null }], pending: [] };
  await fs.writeFile(path.join(app.data, 'sessions.json'), JSON.stringify(saved));
  assert.deepEqual((await app.get('/api/restore')).json().map(s => s.name), ['gamma']);
  assert.deepEqual((await app.post('/api/restore', {})).json(), { done: ['gamma'], failed: [] });
  assert.ok(await sessionNamed('gamma'));
  assert.deepEqual((await app.get('/api/restore')).json(), []);
  const snapshot = JSON.parse(await fs.readFile(path.join(app.data, 'sessions.json'), 'utf8'));
  assert.ok(snapshot.sessions.some(s => s.name === 'gamma'));
  assert.deepEqual(snapshot.pending, []);

  await app.post('/api/sessions/kill', { name: 'gamma' });
  const afterKill = JSON.parse(await fs.readFile(path.join(app.data, 'sessions.json'), 'utf8'));
  assert.equal(afterKill.sessions.some(s => s.name === 'gamma'), false);

  saved.sessions = [{ name: 'delta', dir: '/nowhere', agent: null }];
  await fs.writeFile(path.join(app.data, 'sessions.json'), JSON.stringify(saved));
  const failed = (await app.post('/api/restore', {})).json();
  assert.deepEqual(failed.done, []);
  assert.match(failed.failed[0], /^delta: /);
  assert.deepEqual((await app.post('/api/restore/dismiss', {})).json(), { ok: true });
});

test('usage and machine info', async () => {
  const usage = (await app.get('/api/usage')).json();
  assert.equal(typeof usage.machine.cpu, 'number');
  assert.equal(typeof usage.machine.memTotal, 'number');
  assert.equal(usage.session, null);
  assert.equal(typeof usage.limits, 'object');
});
