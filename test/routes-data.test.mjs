import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { startTestServer } from './helpers/server.mjs';

const run = promisify(execFile);
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const AUTHOR = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };

let app;
let repo;

const q = value => encodeURIComponent(value);

before(async () => {
  app = await startTestServer();
  repo = path.join(app.work, 'repo');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'a.txt'), 'one\n');
  await fs.writeFile(path.join(repo, 'blob.bin'), Buffer.from([1, 0, 2]));
  await fs.writeFile(path.join(repo, 'pic.png'), PNG);
  await fs.writeFile(path.join(repo, 'src', 'b.txt'), 'two\n');
  Object.assign(process.env, AUTHOR);
  await run('git', ['-C', repo, 'init', '-q', '-b', 'main']);
  await run('git', ['-C', repo, 'add', 'a.txt']);
  await run('git', ['-C', repo, 'commit', '-q', '-m', 'first']);
});

after(() => app?.stop());

test('file listing', async () => {
  const listed = (await app.get(`/api/ls?dir=${q(repo)}`)).json();
  assert.equal(listed.dir, repo);
  assert.equal(listed.parent, app.work);
  assert.deepEqual(listed.entries.map(e => [e.name, e.dir, e.git]), [
    ['src', true, 'U'], ['a.txt', false, undefined], ['blob.bin', false, 'U'], ['pic.png', false, 'U'],
  ]);
  assert.equal((await app.get(`/api/ls?dir=${q(app.work)}`)).json().parent, null);
  assert.equal((await app.get(`/api/ls?dir=${q(os.tmpdir())}`)).status, 403);
  assert.equal((await app.get('/api/ls')).status, 403);
  assert.equal((await app.get(`/api/ls?dir=${q(path.join(repo, 'a.txt'))}`)).status, 403);
});

test('file contents', async () => {
  const file = name => app.get(`/api/file?path=${q(path.join(repo, name))}`).then(res => res.json());
  assert.deepEqual(await file('a.txt'), { path: path.join(repo, 'a.txt'), text: 'one\n' });
  assert.deepEqual(await file('blob.bin'), { path: path.join(repo, 'blob.bin'), binary: true });
  assert.deepEqual(await file('pic.png'), { path: path.join(repo, 'pic.png'), image: true });
  assert.equal((await app.get(`/api/file?path=${q(repo)}`)).status, 403);
  const image = await app.get(`/api/raw?path=${q(path.join(repo, 'pic.png'))}`);
  assert.equal(image.headers['content-type'], 'image/png');
  assert.equal(image.headers['content-security-policy'], 'sandbox');
  assert.equal(image.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(image.raw, PNG);
  assert.equal((await app.get(`/api/raw?path=${q(path.join(repo, 'a.txt'))}`)).status, 415);
  assert.equal((await app.get(`/api/raw?path=${q('/etc/hostname')}`)).status, 403);
});

test('uploads are stored in the data directory', async () => {
  const headers = { 'x-termi': '1', 'x-filename': encodeURIComponent('my file?.txt') };
  const res = await app.request('POST', '/api/upload', { headers, body: 'hello' });
  const saved = res.json().path;
  assert.equal(path.dirname(saved), path.join(app.data, 'uploads'));
  assert.match(path.basename(saved), /^\d{14}-[0-9a-f]{6}-my_file_\.txt$/);
  assert.equal(await fs.readFile(saved, 'utf8'), 'hello');
  assert.equal((await app.request('POST', '/api/upload', { body: 'x' })).status, 403);
  const unnamed = await app.request('POST', '/api/upload', { headers: { 'x-termi': '1' }, body: 'x' });
  assert.match(path.basename(unnamed.json().path), /-file$/);
});

test('git status, log and diff', async () => {
  const status = (await app.get(`/api/git?dir=${q(path.join(repo, 'src'))}`)).json();
  assert.equal(status.dir, repo);
  assert.equal(status.commits.length, 1);
  assert.equal(status.commits[0].s, 'first');
  assert.deepEqual(status.branches, ['main']);
  assert.equal(status.graph.rows.length, 1);
  assert.equal((await app.get(`/api/git?dir=${q(app.work)}`)).status, 400);

  await fs.writeFile(path.join(repo, 'a.txt'), 'one\nmore\n');
  const fileDiff = (await app.get(`/api/show?dir=${q(repo)}&file=a.txt`)).json();
  assert.match(fileDiff.text, /\+more/);
  const staged = (await app.get(`/api/show?dir=${q(repo)}&file=a.txt&staged=1`)).json();
  assert.equal(staged.text, '(không có thay đổi)');
  const all = (await app.get(`/api/show?dir=${q(repo)}`)).json();
  assert.deepEqual(all.files, [{ path: 'a.txt', add: 1, del: 0 }]);
  assert.equal(all.commit, null);
  const head = status.commits[0].h;
  const shown = (await app.get(`/api/show?dir=${q(repo)}&rev=${head}`)).json();
  assert.equal(shown.commit.subject, 'first');
  assert.equal(shown.commit.author, 't');
  assert.equal((await app.get(`/api/show?dir=${q(repo)}&rev=${q('--all')}`)).status, 400);
  assert.equal((await app.get(`/api/show?dir=${q(repo)}&file=${q('../x')}`)).status, 400);
});

test('git operations', async () => {
  assert.equal((await app.post('/api/git/op', { dir: repo, op: 'rm' })).status, 400);
  assert.equal((await app.post('/api/git/op', { dir: repo, op: 'toString' })).status, 400);
  assert.equal((await app.post('/api/git/op', { dir: repo, op: 'stage', paths: [] })).status, 400);
  assert.deepEqual((await app.post('/api/git/op', { dir: repo, op: 'stage', paths: ['a.txt'] })).json(),
    { ok: true, output: '' });
  assert.equal((await app.post('/api/git/op', { dir: repo, op: 'commit', message: ' ' })).status, 400);
  const committed = (await app.post('/api/git/op', { dir: repo, op: 'commit', message: 'second' })).json();
  assert.match(committed.output, /second/, JSON.stringify(committed));
  assert.equal((await app.get(`/api/git?dir=${q(repo)}`)).json().commits[0].s, 'second');
  assert.equal((await app.post('/api/git/op', { dir: os.tmpdir(), op: 'fetch' })).status, 403);
});

test('notification settings', async () => {
  const quiet = { on: false, from: '23:00', to: '07:00' };
  const defaults = { waiting: true, done: true, system: true, quiet, muted: [] };
  assert.deepEqual((await app.get('/api/notify')).json(), defaults);
  assert.equal((await app.post('/api/notify', { quiet: { from: '25:00' } })).status, 400);
  const change = { waiting: 1, quiet: { on: true, to: '06:30' }, muted: ['/a', 3] };
  const saved = (await app.post('/api/notify', change)).json();
  const expected = { waiting: true, done: false, system: true, quiet: { on: true, from: '23:00', to: '06:30' },
    muted: ['/a'] };
  assert.deepEqual(saved, expected);
  assert.deepEqual((await app.get('/api/notify')).json(), expected);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(app.data, 'notify.json'), 'utf8')), expected);
});

test('push subscriptions', async () => {
  assert.match((await app.get('/api/push/key')).json().key, /^[A-Za-z0-9_-]{87}$/);
  assert.deepEqual((await app.get('/api/push/alert')).json(), { title: 'termi', body: '', session: '', machine: '' });
  assert.deepEqual((await app.post('/api/push/test', {})).json(), { results: [] });
  assert.equal((await app.post('/api/push/sub', { endpoint: 'nope' })).status, 400);
  assert.equal((await app.post('/api/push/sub', { endpoint: 'https://evil.com/x' })).status, 400);
  assert.equal((await app.post('/api/push/sub', { endpoint: 'http://fcm.googleapis.com/x' })).status, 400);
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
  assert.deepEqual((await app.post('/api/push/sub', { endpoint })).json(), { ok: true });
  assert.deepEqual((await app.post('/api/push/sub', { endpoint })).json(), { ok: true });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(app.data, 'subs.json'), 'utf8')), [{ endpoint }]);
});

test('quick actions and settings info', async () => {
  assert.equal((await app.get('/api/quick')).json(), null);
  assert.equal((await app.post('/api/quick', { items: 'x' })).status, 400);
  const items = [{ emoji: '🚀', name: 'Go', desc: 'd', text: 'run', ask: 1, extra: 1 }, { name: 'empty', text: '' }];
  const saved = (await app.post('/api/quick', { items })).json();
  assert.deepEqual(saved, [{ emoji: '🚀', name: 'Go', desc: 'd', text: 'run', ask: true }]);
  assert.deepEqual((await app.get('/api/quick')).json(), saved);
  assert.equal((await app.post('/api/quick', { items: null })).json(), null);
  assert.equal((await app.get('/api/quick')).json(), null);

  const info = (await app.get('/api/info')).json();
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(info.version, pkg.version);
  assert.deepEqual(info.roots, [app.work]);
  assert.equal(info.host, os.hostname());
  assert.equal(info.claudeUsage, false);
  assert.ok(Array.isArray(info.agents));
});

test('file search by name ranks name matches first and stays inside roots', async () => {
  const found = (await app.get(`/api/find?dir=${q(repo)}&q=b`)).json();
  assert.deepEqual(found.map(f => f.rel), ['blob.bin', 'src/b.txt']);
  assert.equal(found[1].path, path.join(repo, 'src', 'b.txt'));
  assert.deepEqual((await app.get(`/api/find?dir=${q(repo)}&q=`)).json(), []);
  assert.equal((await app.get(`/api/find?dir=${q(os.tmpdir())}&q=a`)).status, 403);
});
