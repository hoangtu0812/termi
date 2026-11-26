import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

let app;

before(async () => {
  app = await startTestServer();
});

after(() => app?.stop());

const TAILNET = { host: 'mac.tail1.ts.net' };
const OWNER_HEADERS = { ...TAILNET, 'tailscale-user-login': 'Owner@Example.com' };

test('request guards', async () => {
  assert.equal((await app.get('/api/agents', { host: 'evil.com' })).status, 421);
  assert.equal((await app.get('/api/agents', { origin: 'https://evil.com' })).status, 403);
  assert.equal((await app.get('/api/agents', TAILNET)).status, 403);
  const stranger = { ...TAILNET, 'tailscale-user-login': 'someone@else.com' };
  assert.equal((await app.get('/api/agents', stranger)).status, 403);
  assert.equal((await app.get('/api/agents', OWNER_HEADERS)).status, 200);
  const json = { 'content-type': 'application/json' };
  const noHeader = await app.request('POST', '/api/restore/dismiss', { headers: json, body: '{}' });
  assert.equal(noHeader.status, 403);
  assert.equal((await app.request('POST', '/api/nope', { headers: json, body: '{}' })).status, 403);
  assert.equal((await app.get('/api/nope')).status, 404);
  assert.equal((await app.post('/api/nope', {})).status, 404);
  assert.equal((await app.request('GET', '/api/restore/dismiss')).status, 404);
});

test('request bodies are bounded and must be JSON', async () => {
  const headers = { 'content-type': 'application/json', 'x-termi': '1' };
  const broken = await app.request('POST', '/api/notify', { headers, body: '{"waiting":' });
  assert.equal(broken.status, 400);
  assert.equal(broken.json().error, 'JSON không hợp lệ');
  const huge = await app.request('POST', '/api/notify', { headers, body: JSON.stringify({ x: 'a'.repeat(70_000) }) });
  assert.equal(huge.status, 413);
});

test('static files carry security headers', async () => {
  const page = await app.get('/');
  assert.equal(page.status, 200);
  assert.equal(page.headers['content-type'], 'text/html');
  assert.equal(page.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(page.headers['content-security-policy'], "frame-ancestors 'self'");
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  assert.equal(page.headers['cache-control'], 'no-cache');
  assert.equal((await app.get('/manifest.json')).headers['content-type'], 'application/manifest+json');
  assert.equal((await app.get('/sw.js')).headers['content-type'], 'text/javascript');
  assert.equal((await app.get('/icon-192.png')).headers['content-type'], 'image/png');
  assert.equal((await app.get('/index.html')).status, 404);
  assert.equal((await app.get('/../package.json')).status, 404);
  assert.equal((await app.request('POST', '/', { headers: { 'x-termi': '1' } })).status, 404);
});

test('bundled fonts are served', async () => {
  const css = await app.get('/fonts/fonts.css');
  assert.equal(css.headers['content-type'], 'text/css');
  const font = await app.get('/fonts/jbm-latin.woff2');
  assert.equal(font.headers['content-type'], 'font/woff2');
  assert.equal(font.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal((await app.get('/fonts/LICENSE.txt')).status, 404);
  assert.equal((await app.get('/fonts/../index.html')).status, 404);
});

test('JSON responses carry the UI build id', async () => {
  const res = await app.get('/api/agents');
  assert.equal(res.headers['content-type'], 'application/json');
  assert.match(res.headers['x-termi-build'], /^\d+(\.\d+)?$/);
});

test('terminal requests are proxied to ttyd', async () => {
  const res = await app.get('/term/token?x=1');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ttyd: true, url: '/term/token?x=1' });
  assert.equal((await app.get('/term')).json().url, '/term');
  assert.equal((await app.get('/terminal')).status, 404);
  assert.equal((await app.get('/term', { host: 'evil.com' })).status, 421);
});

test('WebSocket upgrades are guarded', async () => {
  const before = app.ttyd.seen.filter(entry => entry.kind === 'upgrade').length;
  assert.equal(await app.upgrade('/term/ws', { host: 'evil.com' }), '');
  assert.equal(await app.upgrade('/term/ws', { origin: 'https://evil.com' }), '');
  assert.equal(await app.upgrade('/term/ws', TAILNET), '');
  assert.equal(await app.upgrade('/api/sessions'), '');
  assert.equal(await app.upgrade('/m/other/term/ws'), '');
  assert.equal(app.ttyd.seen.filter(entry => entry.kind === 'upgrade').length, before);
  const accepted = await app.upgrade('/term/ws', { origin: `http://127.0.0.1:${app.port}` });
  assert.match(accepted, /^HTTP\/1\.1 101/);
  const forwarded = app.ttyd.seen.findLast(entry => entry.kind === 'upgrade');
  assert.equal(forwarded.url, '/term/ws');
  assert.equal(forwarded.headers.host, `127.0.0.1:${app.port}`);
  assert.equal(forwarded.headers.origin, `http://127.0.0.1:${app.port}`);
});

test('unknown peers are not proxied', async () => {
  const res = await app.get('/m/desktop-1/api/sessions');
  assert.equal(res.status, 404);
  assert.equal(res.json().error, 'Không tìm thấy máy, hoặc máy đó chưa chạy termi');
  const machines = (await app.get('/api/machines')).json();
  assert.equal(machines.length, 1);
  assert.equal(machines[0].self, true);
  assert.equal('dns' in machines[0], false);
});
