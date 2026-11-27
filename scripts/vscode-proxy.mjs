#!/usr/bin/env node
import http from 'node:http';
import net from 'node:net';
import zlib from 'node:zlib';

const HOST = '127.0.0.1';
const LISTEN_PORT = Number(process.env.VSCODE_PROXY_PORT) || 7683;
const UPSTREAM_PORT = Number(process.env.VSCODE_UPSTREAM_PORT) || 7682;
const MIN_COMPRESS_BYTES = 1024;
const BROTLI_QUALITY = 5;
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|wasm|manifest\+json)|image\/svg\+xml)/;

export function pickEncoding(acceptEncoding, response) {
  const type = response['content-type'] || '';
  const length = Number(response['content-length'] ?? Infinity);
  if (response['content-encoding'] || !COMPRESSIBLE.test(type) || length < MIN_COMPRESS_BYTES) return null;
  const accepted = String(acceptEncoding || '').split(',').map(part => part.split(';')[0].trim());
  if (accepted.includes('br')) return 'br';
  if (accepted.includes('gzip')) return 'gzip';
  return null;
}

function compressor(encoding) {
  if (encoding === 'gzip') return zlib.createGzip();
  return zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } });
}

function forward(port, req, res) {
  const upstream = http.request({ host: HOST, port, path: req.url, method: req.method, headers: req.headers });
  upstream.on('response', answer => {
    const encoding = pickEncoding(req.headers['accept-encoding'], answer.headers);
    if (!encoding) {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
      return;
    }
    const headers = { ...answer.headers, 'content-encoding': encoding, vary: 'Accept-Encoding' };
    delete headers['content-length'];
    res.writeHead(answer.statusCode, headers);
    answer.pipe(compressor(encoding)).pipe(res);
  });
  upstream.on('error', () => res.destroy());
  req.pipe(upstream);
}

function rawRequest(req) {
  const lines = [`${req.method} ${req.url} HTTP/1.1`];
  for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
  return lines.join('\r\n') + '\r\n\r\n';
}

function tunnel(port, req, socket, head) {
  const upstream = net.connect(port, HOST, () => {
    upstream.write(rawRequest(req));
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
}

export function createProxy(upstreamPort = UPSTREAM_PORT) {
  const server = http.createServer((req, res) => forward(upstreamPort, req, res));
  server.on('upgrade', (req, socket, head) => tunnel(upstreamPort, req, socket, head));
  return server;
}

if (import.meta.main) {
  const ready = () => console.log(`vscode-proxy: ${HOST}:${LISTEN_PORT} -> ${UPSTREAM_PORT}`);
  createProxy().listen(LISTEN_PORT, HOST, ready);
}
