import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { createLiveFeed, sseMessage } from '../src/live.mjs';
import { startTestServer } from './helpers/server.mjs';

const fakeClient = () => {
  const req = new EventEmitter();
  const res = { status: 0, headers: null, chunks: [] };
  res.writeHead = (status, headers) => Object.assign(res, { status, headers });
  res.write = text => res.chunks.push(text);
  return { req, res };
};

test('server-sent events are framed with an event name', () => {
  assert.equal(sseMessage('sessions', '[]'), 'event: sessions\ndata: []\n\n');
});

test('live feed sends the list on subscribe and again only when it changes', async () => {
  let current = [{ name: 'a', state: 'idle' }];
  const feed = createLiveFeed({ list: async () => current, checkMs: 60_000, heartbeatMs: 60_000 });
  const { req, res } = fakeClient();
  await feed.subscribe(req, res);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/event-stream');
  assert.equal(res.chunks.at(-1), sseMessage('sessions', JSON.stringify(current)));
  const sent = res.chunks.length;
  await feed.check();
  assert.equal(res.chunks.length, sent);
  current = [{ name: 'a', state: 'working' }];
  await feed.check();
  assert.equal(res.chunks.at(-1), sseMessage('sessions', JSON.stringify(current)));
  req.emit('close');
  assert.equal(feed.size(), 0);
  feed.stop();
});

test('GET /api/stream answers with an event stream', async () => {
  const app = await startTestServer();
  try {
    const first = await new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port: app.port, path: '/api/stream' }, res => {
        res.setEncoding('utf8');
        let text = '';
        res.on('data', chunk => {
          text += chunk;
          if (!text.includes('event: sessions')) return;
          resolve({ type: res.headers['content-type'], text });
          req.destroy();
        });
      });
      req.on('error', reject);
    });
    assert.equal(first.type, 'text/event-stream');
    assert.match(first.text, /^retry: \d+\n\n/);
    assert.match(first.text, /event: sessions\ndata: \[/);
  } finally {
    await app.stop();
  }
});
