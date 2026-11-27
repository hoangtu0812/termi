import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { matchPeer } from '../machines.mjs';

const LOCALHOST = '127.0.0.1';
const HTTPS_PORT = 443;
const BUILD_HEADER = 'x-termi-build';
const TOKEN_HEADER = 'x-termi-token';

export const isTermPath = pathname => pathname === '/term' || pathname.startsWith('/term/');

const pathnameOf = url => new URL(url, 'http://x').pathname;

export function proxyTtyd(req, res, ttydPort) {
  const upstream = { host: LOCALHOST, port: ttydPort, path: req.url, method: req.method, headers: req.headers };
  const up = http.request(upstream, answer => {
    res.writeHead(answer.statusCode, answer.headers);
    answer.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(up);
}

export function peerHeaders(headers, dns) {
  const out = { ...headers, host: dns };
  delete out[TOKEN_HEADER];
  if (out.origin) out.origin = `https://${dns}`;
  return out;
}

export function proxyPeer(req, res, dns, rest) {
  const headers = peerHeaders(req.headers, dns);
  const options = { host: dns, port: HTTPS_PORT, servername: dns, path: rest, method: req.method, headers };
  const up = https.request(options, answer => {
    const answerHeaders = { ...answer.headers };
    delete answerHeaders[BUILD_HEADER];
    res.writeHead(answer.statusCode, answerHeaders);
    answer.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Không kết nối được tới máy kia' }));
  });
  req.pipe(up);
}

export function upgradeRequestHead(req, path, host) {
  let head = `${req.method} ${path} HTTP/1.1\r\n`;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const key = req.rawHeaders[i].toLowerCase();
    if (key === TOKEN_HEADER) continue;
    let value = req.rawHeaders[i + 1];
    if (key === 'host') value = host;
    else if (key === 'origin' && host !== req.headers.host) value = `https://${host}`;
    head += `${req.rawHeaders[i]}: ${value}\r\n`;
  }
  return `${head}\r\n`;
}

function pipeUpgrade({ req, socket, head, connect, path, host }) {
  const up = connect(() => {
    up.write(upgradeRequestHead(req, path, host));
    if (head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
}

export function createUpgradeHandler({ guard, machines, ttydPort }) {
  return async function upgrade(req, socket, head) {
    if (!(await guard.allowsUpgrade(req))) return socket.destroy();
    const peer = matchPeer(req.url);
    if (peer) {
      const dns = await machines.peerDns(peer.id);
      if (!dns || !isTermPath(pathnameOf(peer.rest))) return socket.destroy();
      const connect = ready => tls.connect({ host: dns, port: HTTPS_PORT, servername: dns }, ready);
      return pipeUpgrade({ req, socket, head, connect, path: peer.rest, host: dns });
    }
    if (!isTermPath(pathnameOf(req.url))) return socket.destroy();
    const connect = ready => net.connect(ttydPort, LOCALHOST, ready);
    pipeUpgrade({ req, socket, head, connect, path: req.url, host: req.headers.host });
  };
}
