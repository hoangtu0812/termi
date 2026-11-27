import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { loadConfig } from '../../src/config.mjs';
import { start } from '../../src/start.mjs';

const run = promisify(execFile);

export const OWNER = 'owner@example.com';

export const hasTmux = () => run('tmux', ['-V']).then(() => true, () => false);

function startFakeTtyd() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ kind: 'http', url: req.url, headers: req.headers });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ttyd: true, url: req.url }));
  });
  server.on('upgrade', (req, socket) => {
    seen.push({ kind: 'upgrade', url: req.url, headers: req.headers });
    socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, seen })));
}

function collect(res, resolve) {
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const raw = Buffer.concat(chunks);
    const text = raw.toString('utf8');
    resolve({ status: res.statusCode, headers: res.headers, raw, text, json: () => JSON.parse(text) });
  });
}

function createClient(port) {
  const request = (method, pathname, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const options = { host: '127.0.0.1', port, method, path: pathname, headers };
    const req = http.request(options, res => collect(res, resolve));
    req.on('error', reject);
    req.end(body);
  });

  const get = (pathname, headers) => request('GET', pathname, { headers });

  const post = (pathname, body, headers = {}) => request('POST', pathname, {
    headers: { 'content-type': 'application/json', 'x-termi': '1', ...headers },
    body: JSON.stringify(body),
  });

  const upgrade = (pathname, headers = {}) => new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1', () => {
      const all = { host: `127.0.0.1:${port}`, connection: 'Upgrade', upgrade: 'websocket', ...headers };
      const lines = Object.entries(all).map(([key, value]) => `${key}: ${value}`);
      socket.write(`GET ${pathname} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
    });
    let text = '';
    socket.on('data', chunk => { text += chunk; });
    socket.on('close', () => resolve(text));
    socket.on('error', () => {});
  });

  return { request, get, post, upgrade };
}

function isolateChildProcesses(root) {
  delete process.env.TMUX;
  process.env.TMUX_TMPDIR = path.join(root, 'tmux');
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_NOSYSTEM = '1';
}

export async function startTestServer() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'termi-http-')));
  for (const dir of ['data', 'work', 'home', 'tmux']) await fs.mkdir(path.join(root, dir));
  isolateChildProcesses(root);
  const ttyd = await startFakeTtyd();
  const config = loadConfig({
    TERMI_DATA: path.join(root, 'data'),
    TERMI_ROOTS: path.join(root, 'work'),
    TERMI_ALLOWED_USERS: OWNER,
    TERMI_TAILSCALE: path.join(root, 'no-tailscale'),
  }, path.join(root, 'home'));
  const app = await start({ ...config, port: 0, ttydPort: ttyd.server.address().port });
  const port = app.server.address().port;

  async function stop() {
    await app.close();
    await new Promise(resolve => ttyd.server.close(resolve));
    await run('tmux', ['kill-server']).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }

  const dirs = { root, work: path.join(root, 'work'), data: path.join(root, 'data') };
  return { ...dirs, port, ttyd, stop, ...createClient(port) };
}
