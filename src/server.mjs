// termi: phiên tmux/Claude, terminal, file, git và thông báo đẩy cho điện thoại. Không dependency.
// Chỉ nghe trên 127.0.0.1; ra ngoài qua `tailscale serve` (xem install.sh).
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);
const PUBLIC = path.join(import.meta.dirname, '..', 'public');
const PORT = Number(process.env.TERMI_PORT) || 7680;
const DATA = path.join(os.homedir(), '.termi');
const UPLOADS = path.join(DATA, 'uploads');
const MAX_OUT = 300_000; // ký tự trả về cho diff/file, tránh treo trình duyệt điện thoại
const MAX_UPLOAD = 25 * 1024 * 1024;
const SKIP = new Set(['node_modules', 'Library', 'Applications', 'Pictures', 'Music', 'Movies', 'Downloads']);
const IMAGES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|notify\.windows\.com|push\.services\.mozilla\.com)$/;

export const validName = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s);
export const validRev = s => typeof s === 'string' && /^[0-9a-f]{4,40}$/.test(s);
export const validUuid = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export const validBranch = s => typeof s === 'string' && /^[A-Za-z0-9._\/-]{1,200}$/.test(s) && !s.startsWith('-') && !s.includes('..');
export const validGitPath = s => typeof s === 'string' && s.length > 0 && s.length < 4096 && !s.includes('\0');
export const KEYS = new Set(['Escape', 'C-c', 'C-d', 'Tab', 'BTab', 'Up', 'Down', 'Left', 'Right', 'Enter', 'PageUp', 'PageDown']);
// Chặn DNS rebinding: chỉ nhận Host là localhost hoặc tên Tailscale
export const validHost = h => typeof h === 'string' && /^(localhost|127\.0\.0\.1|[a-z0-9-]+\.[a-z0-9-]+\.ts\.net)(:\d+)?$/i.test(h);

// Các coding agent hỗ trợ. proc nhận ra tiến trình qua đường dẫn file chạy (cột comm của ps).
// shortcut: agent chạy bằng node (comm = node) sẽ không nhận ra; khi cần thì so thêm tham số dòng lệnh
const bin = c => path.basename(c).replace(/\.[cm]?js$/, ''); // codex cài qua npm chạy dạng node …/codex.js
export const AGENTS = {
  claude: { name: 'Claude', cmd: 'claude', resume: id => `claude --resume ${id}`,
    proc: c => bin(c) === 'claude' || c.includes('/.local/share/claude/versions/') },
  codex: { name: 'Codex', cmd: 'codex', resume: id => `codex resume ${id}`, proc: c => bin(c) === 'codex' },
  agy: { name: 'Antigravity', cmd: 'agy', proc: c => bin(c) === 'agy' },
};

// shortcut: đọc trạng thái agent bằng cách nhìn chữ trên màn hình; agent đổi giao diện thì phải sửa regex (hoặc chuyển sang hooks)
export function agentState(screen) {
  const tail = screen.split('\n').filter(l => l.trim()).slice(-15).join('\n');
  // Hỏi xác nhận, hoặc menu lựa chọn đánh số (Claude: ❯ 1.  Codex: › 1.)
  if (/Do you want to|Would you like to|Esc to cancel|Allow command|\(y\/n\)|\[y\/n\]|^\s*[›❯]\s*1\./im.test(tail)) return 'waiting';
  if (/esc to interrupt/i.test(tail)) return 'working';
  return 'idle';
}

const ROOTS = await Promise.all(
  (process.env.TERMI_ROOTS || os.homedir()).split(':').filter(Boolean)
    .map(p => fs.realpath(p).catch(() => path.resolve(p))));
await fs.mkdir(UPLOADS, { recursive: true });

// Trả về đường dẫn thật nếu nằm trong ROOTS và đúng loại (dir/file), ngược lại null
export async function safePath(p, kind = 'dir', roots = ROOTS) {
  if (typeof p !== 'string' || !p) return null;
  let real;
  try {
    real = await fs.realpath(p);
    const st = await fs.stat(real);
    if (kind === 'dir' ? !st.isDirectory() : !st.isFile()) return null;
  } catch { return null; }
  return roots.some(r => real === r || real.startsWith(r + path.sep)) ? real : null;
}
export const safeDir = (p, roots) => safePath(p, 'dir', roots);

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const tmux = (...a) => run('tmux', a, { maxBuffer: 4e6 });
const target = name => `=${name}:`; // `=` = khớp chính xác tên phiên
const clip = s => s.length > MAX_OUT ? s.slice(0, MAX_OUT) + '\n… (đã cắt bớt)' : s;

async function need(p, kind = 'dir') {
  const r = await safePath(p, kind);
  if (!r) throw fail(403, 'Đường dẫn không hợp lệ hoặc nằm ngoài TERMI_ROOTS');
  return r;
}

// ---------- Phiên ----------
async function sessions() {
  let panes;
  try {
    panes = (await tmux('list-panes', '-a', '-F',
      '#{session_name}\t#{window_active}#{pane_active}\t#{pane_pid}\t#{pane_current_path}\t#{session_attached}\t#{session_activity}')).stdout;
  } catch { return []; } // chưa có tmux server = chưa có phiên
  // Tìm tổ tiên của mọi tiến trình agent để biết pane nào đang chạy agent nào
  const parent = new Map(), agentOf = new Map(), found = [];
  // args (dòng lệnh) thay vì comm: trên Linux comm chỉ là tên rút gọn, không có đường dẫn
  const procs = (await run('ps', ['-ax', '-o', 'pid=,ppid=,args='], { maxBuffer: 16e6 })).stdout;
  for (const l of procs.split('\n')) {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    parent.set(m[1], m[2]);
    const args = m[3].split(/\s+/);
    const exe = /^(node|bun|deno)$/.test(path.basename(args[0])) ? args[1] || '' : args[0]; // agent viết bằng JS
    const agent = Object.keys(AGENTS).find(id => AGENTS[id].proc(exe));
    if (agent) found.push([m[1], agent]);
  }
  for (let [p, agent] of found) for (let i = 0; p && p !== '1' && i < 64; i++) { if (!agentOf.has(p)) agentOf.set(p, agent); p = parent.get(p); }

  const by = new Map();
  for (const l of panes.trim().split('\n')) {
    const [name, active, pid, dir, attached, activity] = l.split('\t');
    const s = by.get(name) ?? { name, dir, attached: attached !== '0', activity: Number(activity), agent: null };
    if (active === '11') s.dir = dir;
    s.agent ??= agentOf.get(pid) ?? null;
    by.set(name, s);
  }
  const list = [...by.values()].sort((a, b) => b.activity - a.activity);
  await Promise.all(list.map(async s => {
    const screen = (await tmux('capture-pane', '-p', '-J', '-t', target(s.name)).catch(() => ({ stdout: '' }))).stdout;
    s.state = s.agent ? agentState(screen) : 'shell';
    // Bỏ các dòng khung/trang trí của agent để xem trước có nội dung thật
    s.preview = screen.split('\n').map(l => l.trimEnd())
      .filter(l => l.replace(/[─━│╭╮╰╯\s]/g, '').length > 1 && !/[▐▛▜▝▘█▀]/.test(l) && !/^\s*(⏵|\? for shortcuts)/.test(l))
      .slice(-3).join('\n');
  }));
  return list;
}

let repoCache = { t: 0, list: [] };
async function repos() {
  if (Date.now() - repoCache.t < 60_000) return repoCache.list;
  const found = [];
  async function walk(d, depth) {
    let ents;
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    if (ents.some(e => e.name === '.git')) { found.push(d); return; }
    if (depth === 0) return;
    await Promise.all(ents.filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
      .map(e => walk(path.join(d, e.name), depth - 1)));
  }
  await Promise.all(ROOTS.map(r => walk(r, 4)));
  repoCache = { t: Date.now(), list: found.sort() };
  return repoCache.list;
}

// Hội thoại cũ của các agent: đọc phần đầu file .jsonl để lấy mã, thư mục và câu hỏi đầu tiên
const isRealPrompt = t => typeof t === 'string' && t.trim() && !t.startsWith('<') && !t.startsWith('# AGENTS.md');
const HISTORY = {
  // ~/.claude/projects/<thư mục>/<uuid>.jsonl
  claude: { dir: path.join(os.homedir(), '.claude', 'projects'),
    accept: f => f.split(path.sep).length === 2 && validUuid(path.basename(f, '.jsonl')), // bỏ file phụ ở thư mục con
    parse(o, h) {
    h.cwd ??= o.cwd;
    if (o.type === 'summary' && o.summary) h.title = o.summary;
    const c = o.type === 'user' && !o.isMeta && o.message?.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.find(x => x.type === 'text')?.text : null;
    if (!h.title && isRealPrompt(text)) h.title = text;
  } },
  // ~/.codex/sessions/YYYY/MM/DD/rollout-...-<uuid>.jsonl, dòng đầu là session_meta
  codex: { dir: path.join(os.homedir(), '.codex', 'sessions'), accept: f => path.basename(f).startsWith('rollout-'),
    parse(o, h) {
    const p = o.payload || {};
    if (o.type === 'session_meta') { h.id = p.id; h.cwd = p.cwd; }
    const text = o.type === 'response_item' && p.role === 'user' ? p.content?.find(x => x.type === 'input_text')?.text
      : o.type === 'event_msg' && p.type === 'user_message' ? p.message : null;
    if (!h.title && isRealPrompt(text)) h.title = text;
  } },
};
async function readHead(file, bytes = 512 * 1024) {
  const fh = await fs.open(file);
  const buf = Buffer.alloc(bytes);
  const { bytesRead } = await fh.read(buf, 0, buf.length, 0).finally(() => fh.close());
  return buf.subarray(0, bytesRead).toString().split('\n');
}
async function history() {
  const files = [];
  for (const [agent, { dir, accept }] of Object.entries(HISTORY))
    for (const f of await fs.readdir(dir, { recursive: true }).catch(() => []))
      if (f.endsWith('.jsonl') && accept(f)) files.push({ agent, f: path.join(dir, f) });
  const stats = await Promise.all(files.map(x => fs.stat(x.f).then(s => ({ ...x, t: s.mtimeMs }), () => null)));
  const recent = stats.filter(Boolean).sort((a, b) => b.t - a.t).slice(0, 40);
  return (await Promise.all(recent.map(async ({ agent, f, t }) => {
    const h = { id: agent === 'claude' ? path.basename(f, '.jsonl') : null };
    for (const line of await readHead(f)) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      HISTORY[agent].parse(o, h);
      if (h.id && h.cwd && h.title) break;
    }
    return validUuid(h.id) && h.cwd && { agent, id: h.id, cwd: h.cwd, title: (h.title || '(không tiêu đề)').trim().slice(0, 160), mtime: t };
  }))).filter(Boolean);
}

// Agent nào có cài trên máy này (tìm trong PATH)
async function installedAgents() {
  const dirs = (process.env.PATH || '').split(':').filter(Boolean);
  const ok = await Promise.all(Object.entries(AGENTS).map(async ([id, a]) => {
    for (const d of dirs) if (await fs.access(path.join(d, a.cmd), fs.constants.X_OK).then(() => true, () => false)) return { id, name: a.name };
  }));
  return ok.filter(Boolean);
}

// ---------- Git ----------
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
const git = (dir, ...a) => run('git', ['-C', dir, '-c', 'color.ui=never', ...a], { maxBuffer: 2e7, timeout: 90_000, env: GIT_ENV })
  .then(r => r.stdout, e => { throw fail(400, (e.stderr || e.message).trim().slice(0, 800)); });
async function needRepo(dir) {
  const d = await need(dir);
  return (await git(d, 'rev-parse', '--show-toplevel')).trim();
}

export function parseStatus(raw) {
  const parts = raw.split('\0');
  const head = (parts.shift() || '').replace(/^## /, '');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    files.push({ x: e[0], y: e[1], path: e.slice(3) });
    if (e[0] === 'R' || e[0] === 'C') i++; // -z: tên cũ nằm ở mục tiếp theo
  }
  return { head, files };
}

// Xếp commit vào các làn để vẽ cây. Mỗi hàng: col = làn của commit, seg = đoạn nối
// [làn đầu, y đầu, làn cuối, y cuối] với y: 0 = mép trên, 1 = chấm commit, 2 = mép dưới.
export function graphLayout(commits) {
  let lanes = [], width = 1; // lanes[i] = hash commit mà làn i đang chờ
  const free = () => { const i = lanes.indexOf(null); return i < 0 ? lanes.length : i; };
  const rows = commits.map(c => {
    const before = lanes.slice(), seg = [];
    let col = lanes.indexOf(c.h);
    if (col < 0) col = free(); // đầu nhánh: không có đường vào
    before.forEach((h, i) => { if (h === c.h) seg.push([i, 0, col, 1]); });
    lanes = lanes.map(h => h === c.h ? null : h);
    c.p.forEach((p, k) => {
      let j = lanes.indexOf(p);
      if (j < 0) { j = k === 0 ? col : free(); lanes[j] = p; }
      seg.push([col, 1, j, 2]);
    });
    before.forEach((h, i) => { if (h != null && h !== c.h) seg.push([i, 0, lanes.indexOf(h), 2]); });
    while (lanes.length && lanes.at(-1) == null) lanes.pop();
    width = Math.max(width, before.length, lanes.length, col + 1);
    return { col, seg };
  });
  return { width, rows };
}

const GIT_OPS = {
  stage: (d, b) => git(d, 'add', '--', ...paths(b)),
  // Repo chưa có commit thì không có HEAD để restore: bỏ khỏi index (file trên đĩa giữ nguyên)
  unstage: (d, b) => git(d, 'restore', '--staged', '--', ...paths(b))
    .catch(e => /resolve 'HEAD'/.test(e.message) ? git(d, 'rm', '--cached', '-r', '-q', '--', ...paths(b)) : Promise.reject(e)),
  commit: (d, b) => {
    if (typeof b.message !== 'string' || !b.message.trim() || b.message.length > 5000) throw fail(400, 'Cần nội dung commit');
    return git(d, 'commit', '-m', b.message);
  },
  push: d => git(d, 'push').catch(e => /no upstream/i.test(e.message) ? git(d, 'push', '-u', 'origin', 'HEAD') : Promise.reject(e)),
  pull: d => git(d, 'pull', '--ff-only'),
  fetch: d => git(d, 'fetch', '--all', '--prune'),
  checkout: (d, b) => {
    if (!validBranch(b.branch)) throw fail(400, 'Tên branch không hợp lệ');
    return git(d, 'switch', b.branch.replace(/^origin\//, ''));
  },
};
function paths(b) {
  if (!Array.isArray(b.paths) || !b.paths.length || !b.paths.every(validGitPath)) throw fail(400, 'Danh sách file không hợp lệ');
  return b.paths;
}

// ---------- Thông báo đẩy (Web Push không payload: chỉ cần chữ ký VAPID, không cần mã hoá) ----------
const b64u = b => Buffer.from(b).toString('base64url');
async function loadJson(file, make) {
  try { return JSON.parse(await fs.readFile(path.join(DATA, file), 'utf8')); }
  catch { const v = make(); await saveJson(file, v); return v; }
}
const saveJson = (file, v) => fs.writeFile(path.join(DATA, file), JSON.stringify(v), { mode: 0o600 });
const vapid = await loadJson('vapid.json', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const j = publicKey.export({ format: 'jwk' });
  return { pub: b64u(Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')])),
    priv: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
});
let subs = await loadJson('subs.json', () => []);
let lastAlert = { title: 'termi', body: '', session: '', machine: '' };

async function push(title, body, session, machine = '') {
  lastAlert = { title, body, session, machine, t: Date.now() };
  const gone = new Set();
  await Promise.all(subs.map(async sub => {
    const u = new URL(sub.endpoint);
    const claims = b64u(JSON.stringify({ aud: u.origin, exp: Math.floor(Date.now() / 1000) + 43200, sub: 'mailto:termi@example.com' }));
    const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: vapid.priv, dsaEncoding: 'ieee-p1363' });
    try {
      const r = await fetch(sub.endpoint, { method: 'POST', headers: {
        TTL: '600', Urgency: 'high', 'Content-Length': '0',
        Authorization: `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapid.pub}` } });
      if (r.status === 404 || r.status === 410) gone.add(sub.endpoint);
      else if (!r.ok) console.error('push', r.status, await r.text());
    } catch (e) { console.error('push', e.message); }
  }));
  if (gone.size) { subs = subs.filter(s => !gone.has(s.endpoint)); await saveJson('subs.json', subs); }
}

// Theo dõi chuyển trạng thái của agent (máy này và các máy khác có termi) để báo:
// xong việc, hoặc đang chờ bạn xác nhận. Nhờ vậy chỉ cần bật thông báo ở một máy.
const prevState = new Map();
async function watch() {
  if (!subs.length) return;
  const all = (await sessions()).map(s => ({ ...s, m: '' }));
  for (const p of (await machines()).filter(x => !x.self && x.termi)) {
    const list = await fetch(`https://${p.dns}/api/sessions`, { signal: AbortSignal.timeout(4000) }).then(r => r.json(), () => []);
    if (Array.isArray(list)) all.push(...list.map(s => ({ ...s, m: p.id })));
  }
  for (const s of all) {
    const key = `${s.m}/${s.name}`, prev = prevState.get(key);
    prevState.set(key, s.state);
    if (prev === undefined) continue;
    const who = AGENTS[s.agent]?.name || 'Agent', label = s.m ? `[${s.m}] ${s.name}` : s.name;
    if (s.state === 'waiting' && prev !== 'waiting') await push(`${label}: ${who} cần bạn xác nhận`, s.preview, s.name, s.m);
    else if (s.state === 'idle' && prev === 'working') await push(`${label}: ${who} đã xong`, s.preview, s.name, s.m);
  }
}

// ---------- Nhiều máy trong tailnet ----------
// Máy khác chạy termi riêng (sau tailscale serve); máy này chuyển tiếp /m/<máy>/... sang đó.
const TAILSCALE = process.env.TERMI_TAILSCALE || 'tailscale';
let machineCache = { t: 0, list: [] };
async function machines() {
  if (Date.now() - machineCache.t < 20_000) return machineCache.list;
  const self = { id: '', name: os.hostname().replace(/\.local$/, ''), os: process.platform, online: true, termi: true, self: true };
  let st;
  try { st = JSON.parse((await run(TAILSCALE, ['status', '--json'], { maxBuffer: 8e6, timeout: 5000 })).stdout); }
  catch { return (machineCache = { t: Date.now(), list: [self] }).list; } // không có tailscale (vd. trong WSL): chỉ máy này
  self.name = st.Self?.HostName || self.name;
  const dnsOf = p => (p.DNSName || '').replace(/\.$/, '');
  const peers = await Promise.all(Object.values(st.Peer || {})
    .filter(p => ['windows', 'linux', 'macOS'].includes(p.OS) && dnsOf(p) && !p.Tags?.length)
    .map(async p => {
      const dns = dnsOf(p);
      const termi = !!p.Online && await fetch(`https://${dns}/api/agents`, { signal: AbortSignal.timeout(2500) }).then(r => r.ok, () => false);
      return { id: dns.split('.')[0].toLowerCase(), dns, name: p.HostName, os: p.OS, online: !!p.Online, termi };
    }));
  peers.sort((a, b) => b.termi - a.termi || b.online - a.online || a.name.localeCompare(b.name));
  return (machineCache = { t: Date.now(), list: [self, ...peers] }).list;
}
// Chỉ chuyển tiếp tới máy có trong tailnet và đang chạy termi (không cho chuyển tiếp đi nơi khác)
async function peerDns(id) {
  return (await machines()).find(m => !m.self && m.termi && m.id === id)?.dns;
}
export function matchPeer(url) {
  const m = /^\/m\/([a-z0-9-]{1,63})(\/.*)?$/i.exec(url);
  return m && { id: m[1].toLowerCase(), rest: m[2] || '/' };
}

// ---------- API ----------
const routes = {
  'GET /api/sessions': () => sessions(),
  // Thư mục gợi ý: phiên đang mở, nơi từng chạy Claude, rồi các repo git
  async 'GET /api/dirs'() {
    const [s, h, r] = await Promise.all([sessions(), history().catch(() => []), repos()]);
    const recent = [];
    for (const d of new Set([...s.map(x => x.dir), ...h.map(x => x.cwd), ...r])) if (await safeDir(d)) recent.push(d);
    return { roots: ROOTS, recent };
  },
  'GET /api/history': () => history(),
  'GET /api/agents': () => installedAgents(),
  'GET /api/machines': async () => (await machines()).map(({ dns, ...m }) => m),

  async 'POST /api/sessions'(_, b) {
    if (!validName(b.name)) throw fail(400, 'Tên phiên chỉ gồm chữ, số, - và _');
    if (b.resume !== undefined && !validUuid(b.resume)) throw fail(400, 'Mã hội thoại không hợp lệ');
    if (b.agent !== undefined && !Object.hasOwn(AGENTS, b.agent)) throw fail(400, 'Agent không hỗ trợ');
    if (b.resume !== undefined && !AGENTS[b.agent]?.resume) throw fail(400, 'Agent này không mở lại được hội thoại cũ');
    const dir = await need(b.dir);
    await tmux('new-session', '-d', '-s', b.name, '-c', dir).catch(() => { throw fail(409, 'Phiên đã tồn tại'); });
    // Gõ lệnh vào shell để khi agent thoát vẫn còn shell, phiên không mất
    const a = AGENTS[b.agent];
    if (a) await tmux('send-keys', '-t', target(b.name), b.resume ? a.resume(b.resume) : a.cmd, 'Enter');
    return { ok: true };
  },
  async 'POST /api/sessions/rename'(_, b) {
    if (!validName(b.name) || !validName(b.to)) throw fail(400, 'Tên phiên chỉ gồm chữ, số, - và _');
    await tmux('rename-session', '-t', target(b.name), b.to).catch(() => { throw fail(409, 'Không đổi tên được (trùng tên?)'); });
    return { ok: true };
  },
  async 'POST /api/sessions/kill'(_, b) {
    if (!validName(b.name)) throw fail(400, 'Phiên không hợp lệ');
    await tmux('kill-session', '-t', target(b.name)).catch(() => { throw fail(404, 'Không tìm thấy phiên'); });
    return { ok: true };
  },

  async 'POST /api/send'(_, b) {
    if (!validName(b.session)) throw fail(400, 'Phiên không hợp lệ');
    const t = target(b.session);
    if (b.key !== undefined) {
      if (!KEYS.has(b.key)) throw fail(400, 'Phím không hỗ trợ');
      await tmux('send-keys', '-t', t, b.key);
    }
    if (typeof b.text === 'string' && b.text) {
      if (b.text.length > 20_000) throw fail(413, 'Văn bản quá dài');
      // Đang cuộn xem lịch sử (copy mode) thì chữ sẽ bị hiểu là lệnh của copy mode: thoát ra trước
      if ((await tmux('display', '-p', '-t', t, '#{pane_in_mode}')).stdout.trim() === '1') await tmux('send-keys', '-t', t, '-X', 'cancel');
      // paste-buffer -p = bracketed paste: văn bản nhiều dòng không bị gửi từng dòng
      await tmux('set-buffer', '-b', 'termi', '--', b.text);
      await tmux('paste-buffer', '-p', '-d', '-b', 'termi', '-t', t);
    }
    if (b.enter) await tmux('send-keys', '-t', t, 'Enter');
    return { ok: true };
  },

  // ---- File ----
  async 'GET /api/ls'(q) {
    const dir = await need(q.get('dir'));
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const list = await Promise.all(ents.filter(e => e.name !== '.git' && e.name !== '.DS_Store' && !e.name.startsWith('._')).map(async e => {
      const p = path.join(dir, e.name);
      const st = await fs.stat(p).catch(() => null);
      return st && { name: e.name, path: p, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
    }));
    return { dir, parent: await safeDir(path.dirname(dir)) && path.dirname(dir),
      entries: list.filter(Boolean).sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name)) };
  },
  async 'GET /api/file'(q) {
    const f = await need(q.get('path'), 'file');
    const ext = path.extname(f).toLowerCase();
    if (IMAGES[ext]) return { path: f, image: true };
    const fh = await fs.open(f);
    const buf = Buffer.alloc(MAX_OUT + 1);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0).finally(() => fh.close());
    const data = buf.subarray(0, bytesRead);
    if (data.includes(0)) return { path: f, binary: true };
    return { path: f, text: clip(data.toString('utf8')) };
  },

  // ---- Git ----
  async 'GET /api/git'(q) {
    const dir = await needRepo(q.get('dir'));
    const [status, log, branches] = await Promise.all([
      git(dir, 'status', '--porcelain=v1', '-b', '-z'),
      git(dir, 'log', '--all', '--date-order', '-n', '200', '--format=%H%x1f%P%x1f%D%x1f%s%x1f%an%x1f%at').catch(() => ''),
      git(dir, 'branch', '-a', '--format=%(refname:short)').catch(() => ''),
    ]);
    const commits = log.split('\n').filter(Boolean).map(l => {
      const [h, p, d, s, a, t] = l.split('\x1f');
      return { h, p: p ? p.split(' ') : [], refs: d ? d.split(', ') : [], s, a, t: Number(t) * 1000 };
    });
    return { dir, ...parseStatus(status), commits, graph: graphLayout(commits), branches: branches.split('\n').filter(b => b && !b.endsWith('/HEAD') && b !== 'origin') };
  },
  // rev = commit; file = diff một file (staged=1 cho phần đã stage); không có gì = mọi thay đổi chưa commit
  async 'GET /api/show'(q) {
    const dir = await needRepo(q.get('dir'));
    const rev = q.get('rev'), file = q.get('file');
    if (rev && !validRev(rev)) throw fail(400, 'Mã commit không hợp lệ');
    if (file !== null && !validGitPath(file)) throw fail(400, 'File không hợp lệ');
    const out = rev ? await git(dir, 'show', '--stat', '--patch', '--format=%H%n%an  %ad%n%n%B', rev)
      : file ? await git(dir, 'diff', ...(q.get('staged') ? ['--cached'] : []), '--', file)
      : await git(dir, 'diff', 'HEAD', '--stat', '--patch').catch(() => git(dir, 'diff', '--stat', '--patch'));
    return { text: clip(out) || '(không có thay đổi)' };
  },
  async 'POST /api/git/op'(_, b) {
    const op = Object.hasOwn(GIT_OPS, b.op) && GIT_OPS[b.op];
    if (!op) throw fail(400, 'Thao tác không hỗ trợ');
    const out = await op(await needRepo(b.dir), b);
    return { ok: true, output: (out || '').trim().slice(0, 2000) };
  },

  // ---- Thông báo ----
  'GET /api/push/key': () => ({ key: vapid.pub }),
  'GET /api/push/alert': () => lastAlert,
  async 'POST /api/push/sub'(_, b) {
    let u;
    try { u = new URL(b.endpoint); } catch { throw fail(400, 'Endpoint không hợp lệ'); }
    if (u.protocol !== 'https:' || !PUSH_HOSTS.test(u.hostname)) throw fail(400, 'Dịch vụ push không được hỗ trợ');
    subs = [...subs.filter(s => s.endpoint !== b.endpoint), { endpoint: b.endpoint }];
    await saveJson('subs.json', subs);
    return { ok: true };
  },
  'POST /api/push/test': async () => { await push('termi', 'Thông báo hoạt động 👍', ''); return { ok: true }; },
};

// Upload: body là nội dung file thô, lưu vào ~/.termi/uploads và trả đường dẫn để chèn vào prompt
async function upload(req) {
  const raw = decodeURIComponent(req.headers['x-filename'] || 'file');
  const name = path.basename(raw).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-80) || 'file';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const dest = path.join(UPLOADS, `${stamp}-${crypto.randomBytes(3).toString('hex')}-${name}`);
  let size = 0;
  req.on('data', c => { size += c.length; if (size > MAX_UPLOAD) req.destroy(fail(413, 'File quá lớn (tối đa 25MB)')); });
  try { await pipeline(req, createWriteStream(dest, { flags: 'wx' })); }
  catch (e) { await fs.rm(dest, { force: true }); throw e.status ? e : fail(400, 'Upload lỗi'); }
  return { path: dest };
}

const STATIC = {
  '/': ['index.html', 'text/html'], '/manifest.json': ['manifest.json', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'], '/sw.js': ['sw.js', 'text/javascript'],
};

async function readBody(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 64_000) throw fail(413, 'Body quá lớn'); }
  try { return JSON.parse(s || '{}'); } catch { throw fail(400, 'JSON không hợp lệ'); }
}

// ---------- Chuyển tiếp /term/* sang ttyd ----------
// Terminal cùng origin với app thì app mới chỉnh được cỡ chữ, cuộn bằng cảm ứng và tự kết nối lại.
const TTYD_PORT = Number(process.env.TERMI_TTYD_PORT) || 7681;
export const isTermPath = p => p === '/term' || p.startsWith('/term/');

function proxyHttp(req, res) {
  const up = http.request({ host: '127.0.0.1', port: TTYD_PORT, path: req.url, method: req.method, headers: req.headers }, r => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(up);
}

// Nối WebSocket tới ttyd máy này (net) hoặc termi máy khác (tls). Sang máy khác thì đổi Host/Origin
// thành tên máy đích, vì ttyd bên đó kiểm tra origin.
function pipeUpgrade(req, socket, head, connect, path, host) {
  const up = connect(() => {
    let raw = `${req.method} ${path} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i].toLowerCase();
      const v = k === 'host' ? host : k === 'origin' && host !== req.headers.host ? `https://${host}` : req.rawHeaders[i + 1];
      raw += `${req.rawHeaders[i]}: ${v}\r\n`;
    }
    up.write(raw + '\r\n');
    if (head.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
}

async function proxyUpgrade(req, socket, head) {
  if (!validHost(req.headers.host)) return socket.destroy();
  const peer = matchPeer(req.url);
  if (peer) {
    const dns = await peerDns(peer.id);
    if (!dns || !isTermPath(new URL(peer.rest, 'http://x').pathname)) return socket.destroy();
    return pipeUpgrade(req, socket, head, cb => tls.connect({ host: dns, port: 443, servername: dns }, cb), peer.rest, dns);
  }
  if (!isTermPath(new URL(req.url, 'http://x').pathname)) return socket.destroy();
  pipeUpgrade(req, socket, head, cb => net.connect(TTYD_PORT, '127.0.0.1', cb), req.url, req.headers.host);
}

// HTTP sang termi máy khác. Bỏ x-termi-build: phiên bản giao diện máy kia không liên quan tới trang đang mở
function proxyPeer(req, res, dns, rest) {
  const headers = { ...req.headers, host: dns };
  if (headers.origin) headers.origin = `https://${dns}`;
  const up = https.request({ host: dns, port: 443, servername: dns, path: rest, method: req.method, headers }, r => {
    const h = { ...r.headers };
    delete h['x-termi-build'];
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Không kết nối được tới máy kia' }));
  });
  req.pipe(up);
}

async function handle(req, res) {
  if (!validHost(req.headers.host)) throw fail(421, 'Host không hợp lệ');
  const peer = matchPeer(req.url);
  if (peer) {
    const dns = await peerDns(peer.id);
    if (!dns) throw fail(404, 'Không tìm thấy máy, hoặc máy đó chưa chạy termi');
    return proxyPeer(req, res, dns, peer.rest);
  }
  const url = new URL(req.url, 'http://x');
  if (isTermPath(url.pathname)) return proxyHttp(req, res);
  const st = req.method === 'GET' && STATIC[url.pathname];
  if (st) {
    const file = await fs.readFile(path.join(PUBLIC, st[0]));
    res.writeHead(200, { 'content-type': st[1], 'cache-control': 'no-cache' });
    return res.end(file);
  }
  if (req.method === 'GET' && url.pathname === '/api/raw') {
    // Chỉ phục vụ ảnh; CSP sandbox để SVG mở trực tiếp cũng không chạy được script trên origin này
    const f = await need(url.searchParams.get('path'), 'file');
    const type = IMAGES[path.extname(f).toLowerCase()];
    if (!type) throw fail(415, 'Chỉ xem trực tiếp được ảnh');
    const file = await fs.readFile(f);
    res.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' });
    return res.end(file);
  }
  // Header tự đặt buộc trình duyệt preflight CORS (mà ta không trả lời) → chặn CSRF từ trang khác
  if (req.method === 'POST' && req.headers['x-termi'] !== '1') throw fail(403, 'Thiếu header X-Termi');
  let data;
  if (req.method === 'POST' && url.pathname === '/api/upload') data = await upload(req);
  else {
    const fn = Object.hasOwn(routes, `${req.method} ${url.pathname}`) && routes[`${req.method} ${url.pathname}`];
    if (!fn) throw fail(404, 'Không tìm thấy');
    data = await fn(url.searchParams, req.method === 'POST' ? await readBody(req) : {});
  }
  // Phiên bản giao diện = thời điểm sửa index.html; trang cũ thấy khác thì tự tải lại
  const build = String((await fs.stat(path.join(PUBLIC, 'index.html'))).mtimeMs);
  res.writeHead(200, { 'content-type': 'application/json', 'x-termi-build': build });
  res.end(JSON.stringify(data));
}

if (import.meta.main) {
  http.createServer((req, res) => handle(req, res).catch(e => {
    if (!e.status) console.error(e);
    if (res.headersSent) return res.destroy();
    res.writeHead(e.status || 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: e.status ? e.message : 'Lỗi máy chủ' }));
  })).on('upgrade', proxyUpgrade)
    .listen(PORT, process.env.TERMI_HOST || '127.0.0.1', () => console.log(`termi: http://127.0.0.1:${PORT}  roots=${ROOTS.join(', ')}`));
  setInterval(() => watch().catch(e => console.error('watch', e.message)), 3000);
}
