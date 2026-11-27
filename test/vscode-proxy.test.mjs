import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { createProxy, pickEncoding } from '../scripts/vscode-proxy.mjs';

const BIG_JS = 'const x = 1;\n'.repeat(1000);

test('only large text responses the browser can decode are compressed', () => {
  const js = { 'content-type': 'text/javascript', 'content-length': '50000' };
  assert.equal(pickEncoding('gzip, deflate, br', js), 'br');
  assert.equal(pickEncoding('gzip;q=1.0', js), 'gzip');
  assert.equal(pickEncoding('', js), null);
  assert.equal(pickEncoding('br', { ...js, 'content-length': '200' }), null);
  assert.equal(pickEncoding('br', { ...js, 'content-encoding': 'gzip' }), null);
  assert.equal(pickEncoding('br', { 'content-type': 'image/png' }), null);
  assert.equal(pickEncoding('br', { 'content-type': 'application/json' }), 'br');
});

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

function get(port, path, headers) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('the proxy compresses upstream scripts and keeps the request path and host', async () => {
  const seen = [];
  const upstream = http.createServer((req, res) => {
    seen.push([req.url, req.headers.host]);
    res.writeHead(200, { 'content-type': 'text/javascript', 'content-length': Buffer.byteLength(BIG_JS) });
    res.end(BIG_JS);
  });
  const proxy = createProxy(await listen(upstream));
  const port = await listen(proxy);
  try {
    const res = await get(port, '/static/a.js?v=1', { 'accept-encoding': 'br', host: 'mac.ts.net:9443' });
    assert.equal(res.headers['content-encoding'], 'br');
    assert.equal(res.headers['content-length'], undefined);
    assert.ok(res.body.length < BIG_JS.length / 10);
    assert.equal(zlib.brotliDecompressSync(res.body).toString(), BIG_JS);
    assert.deepEqual(seen, [['/static/a.js?v=1', 'mac.ts.net:9443']]);
    const plain = await get(port, '/static/a.js', {});
    assert.equal(plain.body.toString(), BIG_JS);
  } finally {
    proxy.close();
    upstream.close();
  }
});
