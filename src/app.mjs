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
import { chatItems, transcriptMessages } from './agents/chat.mjs';
import { createHistory } from './agents/history.mjs';
import { createAgents } from './agents/index.mjs';
import { readTail } from './agents/jsonl.mjs';
import { executableOf } from './agents/process.mjs';
import { createReplyReader } from './agents/reply.mjs';
import { MAX_OUTPUT_CHARS, MAX_UPLOAD_BYTES, resolveRoots } from './config.mjs';
import { fail } from './errors.mjs';
import { GIT_OPS } from './git/ops.mjs';
import { graphLayout } from './git/graph.mjs';
import { LOG_FORMAT, marksFromStatus, parseLog, parseNumstat, parseStatus } from './git/parse.mjs';
import { git } from './git/run.mjs';
import { clip, prettyModel } from './text.mjs';
import { serverStartTime, target, tmux } from './tmux/client.mjs';
import { agentState, parseChoices, parseMulti, stepsToSubmit } from './tmux/screen.mjs';
import {
  safePath, validGitPath, validHost, validKey, validName, validRev, validTime, validUuid,
} from './validate.mjs';
import { createStore } from './store.mjs';

const run = promisify(execFile);
let config;
let allowedRoots = [];
let store;
let staticFiles = {};
let agents;
let history;
let lastReply;
const SKIP = new Set(['node_modules', 'Library', 'Applications', 'Pictures', 'Music', 'Movies', 'Downloads']);
const IMAGES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|notify\.windows\.com|push\.services\.mozilla\.com)$/;

const inRoots = (candidate, kind = 'dir') => safePath(candidate, kind, allowedRoots);

async function need(p, kind = 'dir') {
  const r = await inRoots(p, kind);
  if (!r) throw fail(403, 'Đường dẫn không hợp lệ hoặc nằm ngoài TERMI_ROOTS');
  return r;
}

// ---------- Phiên ----------
const stateSince = new Map();
// Số file chưa commit của thư mục phiên; bộ nhớ đệm 15 giây (danh sách phiên được gọi 3 giây một lần)
const changeCache = new Map();
async function changeCount(dir) {
  const c = changeCache.get(dir);
  if (c && Date.now() - c.t < 15_000) return c.n;
  const n = await run('git', ['-C', dir, 'status', '--porcelain=v1', '-z'], { timeout: 5000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
    .then(r => r.stdout.split('\0').filter(Boolean).length, () => null); // không phải repo git: null
  changeCache.set(dir, { t: Date.now(), n });
  return n;
}

async function sessions() {
  let panes;
  try {
    panes = (await tmux('list-panes', '-a', '-F',
      '#{session_name}\t#{window_active}#{pane_active}\t#{pane_pid}\t#{pane_current_path}\t#{session_attached}\t#{session_activity}\t#{window_activity}')).stdout;
  } catch { return []; } // chưa có tmux server = chưa có phiên
  // Tìm tổ tiên của mọi tiến trình agent để biết pane nào đang chạy agent nào
  const parent = new Map(), agentOf = new Map(), agentPidOf = new Map(), found = [];
  // args (dòng lệnh) thay vì comm: trên Linux comm chỉ là tên rút gọn, không có đường dẫn
  const procs = (await run('ps', ['-ax', '-o', 'pid=,ppid=,args='], { maxBuffer: 16e6 })).stdout;
  for (const l of procs.split('\n')) {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    parent.set(m[1], m[2]);
    const agent = agents.detect(executableOf(m[3]));
    if (agent) found.push([m[1], agent]);
  }
  for (const [pid, agent] of found)
    for (let p = pid, i = 0; p && p !== '1' && i < 64; i++) {
      if (!agentOf.has(p)) { agentOf.set(p, agent); agentPidOf.set(p, pid); }
      p = parent.get(p);
    }

  const by = new Map();
  for (const l of panes.trim().split('\n')) {
    const [name, active, pid, dir, attached, activity, output] = l.split('\t');
    const s = by.get(name) ?? { name, dir, attached: attached !== '0', activity: Number(activity), agent: null };
    if (active === '11') { s.dir = dir; s.output = Number(output); } // lần cuối cửa sổ đang mở có chữ mới
    if (!s.agent && agentOf.has(pid)) { s.agent = agentOf.get(pid); s.agentPid = agentPidOf.get(pid); }
    if (s.agent && s.agentPid && !s.convId) {
      const conversation = await agents.get(s.agent).conversation(s.agentPid);
      if (conversation?.id) s.convId = conversation.id;
      if (conversation?.title) s.title = conversation.title;
    }
    by.set(name, s);
  }
  const list = [...by.values()].sort((a, b) => b.activity - a.activity);
  const changeCounts = await Promise.all(list.map(x => changeCount(x.dir)));
  list.forEach((x, i) => { x.changes = changeCounts[i]; });
  await Promise.all(list.map(async s => {
    const screen = (await tmux('capture-pane', '-p', '-J', '-t', target(s.name)).catch(() => ({ stdout: '' }))).stdout;
    s.state = s.agent ? agentState(screen) : 'shell';
    if (s.state === 'waiting') { // câu hỏi + các lựa chọn để hiện nút bấm (chọn một) hoặc ô tích (chọn nhiều)
      const one = parseChoices(screen);
      Object.assign(s, one.choices ? one : parseMulti(screen));
    }
    // Bỏ các dòng khung/trang trí của agent để xem trước có nội dung thật
    s.preview = screen.split('\n').map(l => l.trimEnd())
      .filter(l => l.replace(/[─━│╭╮╰╯\s]/g, '').length > 1 && !/[▐▛▜▝▘█▀]/.test(l) && !/^\s*(⏵|\? for shortcuts)/.test(l))
      .slice(-3).join('\n');
    s.previewKind = 'screen';
    // Phiên có agent: câu trả lời gần nhất dễ đọc hơn chữ chụp từ terminal. Riêng lúc chờ xác nhận
    // thì giữ màn hình, vì câu hỏi xác nhận không có trong file hội thoại.
    if (s.agent) {
      const adapter = agents.get(s.agent);
      const r = await lastReply(adapter, s.dir, s.agentPid).catch(() => null);
      if (r?.text && s.state !== 'waiting') { s.preview = r.text; s.previewKind = 'reply'; }
      s.model = (await adapter.liveModel(s.convId)) || prettyModel(r?.model);
      s.replyAt = r?.replyAt || null; // để đánh dấu "chưa xem"
      if (s.state === 'working' && r?.lastTool) s.doing = r.lastTool; // thanh "agent đang làm gì"
    }
    // Trạng thái bắt đầu từ lúc nào (vd. "đang chạy 3 phút"); cùng một mốc cho mọi thiết bị
    const prev = stateSince.get(s.name);
    if (prev?.state !== s.state) stateSince.set(s.name, { state: s.state, since: Date.now() });
    s.since = stateSince.get(s.name).since;
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
  await Promise.all(allowedRoots.map(r => walk(r, 4)));
  repoCache = { t: Date.now(), list: found.sort() };
  return repoCache.list;
}

async function machineUsage() {
  const cpu = Math.min(100, Math.round(os.loadavg()[0] / os.cpus().length * 100)); // tải trung bình 1 phút / số nhân
  let mem = null;
  if (process.platform === 'darwin') {
    // os.freemem() trên macOS không tính bộ nhớ cache nên luôn trông như gần đầy
    const m = /(\d+)%/.exec((await run('memory_pressure', [], { timeout: 3000 }).catch(() => ({ stdout: '' }))).stdout.trim().split('\n').pop() || '');
    if (m) mem = 100 - Number(m[1]);
  } else {
    const mi = await fs.readFile('/proc/meminfo', 'utf8').catch(() => '');
    const kb = k => Number(new RegExp(`${k}:\\s+(\\d+)`).exec(mi)?.[1] || 0);
    if (kb('MemTotal')) mem = Math.round(100 - kb('MemAvailable') / kb('MemTotal') * 100);
  }
  const d = await fs.statfs(os.homedir()).catch(() => null);
  return { cpu, mem, memTotal: os.totalmem(), disk: d && Math.round(100 - d.bavail / d.blocks * 100), diskFree: d && d.bavail * d.bsize };
}

async function usage(sessionName) {
  const s = validName(sessionName) ? (await sessions()).find(x => x.name === sessionName) : null;
  const [machine, limits, tokens] = await Promise.all([
    machineUsage(),
    agents.limits(),
    s?.agent ? agents.get(s.agent).sessionTokens(s.dir, s.agentPid) : null,
  ]);
  return { machine, limits, session: s && { name: s.name, agent: s.agent, ...tokens } };
}

async function gitMarks(dir) {
  try {
    const top = (await git(dir, 'rev-parse', '--show-toplevel')).trim();
    const raw = await git(top, 'status', '--porcelain=v1', '-z', '--untracked-files=normal');
    return marksFromStatus(raw, path.relative(top, dir));
  } catch { return new Map(); } // không phải repo git
}

const tailscaleStatus = async () => JSON.parse((await run(config.tailscale, ['status', '--json'], {
  maxBuffer: 8e6,
  timeout: 5000,
})).stdout);
async function needRepo(dir) {
  const d = await need(dir);
  return (await git(d, 'rev-parse', '--show-toplevel')).trim();
}

const b64u = b => Buffer.from(b).toString('base64url');

function createVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return { pub: b64u(point), priv: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
}

async function loadVapidKeys() {
  const saved = await store.read('vapid.json', { strict: true });
  if (saved) {
    if (typeof saved.pub !== 'string' || typeof saved.priv !== 'string') {
      throw new Error('vapid.json has no pub/priv keys; fix or remove it');
    }
    return saved;
  }
  const created = createVapidKeys();
  await store.write('vapid.json', created);
  return created;
}

let vapid;
let subs = [];
let lastAlert = { title: 'termi', body: '', session: '', machine: '' };

async function push(title, body, session, machine = '') {
  lastAlert = { title, body, session, machine, t: Date.now() };
  const gone = new Set();
  const results = await Promise.all(subs.map(async sub => {
    const u = new URL(sub.endpoint);
    const claims = b64u(JSON.stringify({ aud: u.origin, exp: Math.floor(Date.now() / 1000) + 43200, sub: 'mailto:termi@example.com' }));
    const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: vapid.priv, dsaEncoding: 'ieee-p1363' });
    try {
      const r = await fetch(sub.endpoint, { method: 'POST', headers: {
        TTL: '600', Urgency: 'high', 'Content-Length': '0',
        Authorization: `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapid.pub}` } });
      const detail = r.ok ? '' : (await r.text()).slice(0, 300);
      if (!r.ok) console.error('push', u.hostname, r.status, detail); // ghi cả 404/410 để còn biết vì sao đăng ký bị xoá
      if (r.status === 404 || r.status === 410) gone.add(sub.endpoint);
      return { host: u.hostname, status: r.status, detail };
    } catch (e) {
      console.error('push', u.hostname, e.message);
      return { host: u.hostname, status: 0, detail: e.message };
    }
  }));
  if (gone.size) { subs = subs.filter(s => !gone.has(s.endpoint)); await store.write('subs.json', subs); }
  return results;
}

// Theo dõi chuyển trạng thái của agent (máy này và các máy khác có termi) để báo:
// xong việc, hoặc đang chờ bạn xác nhận. Nhờ vậy chỉ cần bật thông báo ở một máy.
const prevState = new Map();
// Tuỳ chỉnh thông báo đẩy: loại cần báo, giờ yên lặng, phiên bị tắt (hộp thông báo trong app vẫn ghi đủ)
const NOTIFY_DEFAULT = { waiting: true, done: true, quiet: { on: false, from: '23:00', to: '07:00' }, muted: [] };
let notifyPrefs = NOTIFY_DEFAULT;
const hm = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export function shouldPush(prefs, kind, key, now = new Date()) {
  if (!prefs[kind] || prefs.muted?.includes(key)) return false;
  if (prefs.quiet?.on) {
    const cur = now.getHours() * 60 + now.getMinutes(), from = hm(prefs.quiet.from), to = hm(prefs.quiet.to);
    if (from <= to ? cur >= from && cur < to : cur >= from || cur < to) return false; // khoảng qua nửa đêm
  }
  return true;
}

// Hộp thông báo trong app: 30 sự kiện gần nhất (agent xong việc / cần xác nhận), ghi cả khi chưa bật đẩy
const events = [];
async function watch() {
  const all = (await sessions()).map(s => ({ ...s, m: '' }));
  if (subs.length) for (const p of (await machines()).filter(x => !x.self && x.termi)) {
    const list = await fetch(`https://${p.dns}/api/sessions`, { signal: AbortSignal.timeout(4000) }).then(r => r.json(), () => []);
    if (Array.isArray(list)) all.push(...list.map(s => ({ ...s, m: p.id })));
  }
  for (const s of all) {
    const key = `${s.m}/${s.name}`, prev = prevState.get(key);
    prevState.set(key, s.state);
    if (prev === undefined) continue;
    const who = agents.nameOf(s.agent), label = s.m ? `[${s.m}] ${s.name}` : s.name;
    const kind = s.state === 'waiting' && prev !== 'waiting' ? 'waiting' : s.state === 'idle' && prev === 'working' ? 'done' : null;
    if (!kind) continue;
    const title = `${label}: ${who} ${kind === 'waiting' ? 'cần bạn xác nhận' : 'đã xong'}`;
    events.unshift({ t: Date.now(), kind, title, body: s.preview, session: s.name, machine: s.m, agent: s.agent });
    events.splice(30);
    if (subs.length && shouldPush(notifyPrefs, kind, `${s.m}/${s.name}`)) await push(title, s.preview, s.name, s.m);
  }
}

// ---------- Nhiều máy trong tailnet ----------
// Máy khác chạy termi riêng (sau tailscale serve); máy này chuyển tiếp /m/<máy>/... sang đó.
let machineCache = { t: 0, list: [] };
async function machines() {
  if (Date.now() - machineCache.t < 20_000) return machineCache.list;
  const self = { id: '', name: os.hostname().replace(/\.local$/, ''), os: process.platform, online: true, termi: true, self: true };
  let st;
  try { st = await tailscaleStatus(); }
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

// ---------- Tạo phiên và khôi phục sau khi khởi động lại máy ----------
async function createSession(b) {
  if (!validName(b.name)) throw fail(400, 'Tên phiên chỉ gồm chữ, số, - và _');
  if (b.resume != null && !validUuid(b.resume)) throw fail(400, 'Mã hội thoại không hợp lệ');
  if (b.agent != null && !agents.has(b.agent)) throw fail(400, 'Agent không hỗ trợ');
  if (b.resume != null && !agents.get(b.agent)?.resumeCommand) throw fail(400, 'Agent này không mở lại được hội thoại cũ');
  const dir = await need(b.dir);
  await tmux('new-session', '-d', '-s', b.name, '-c', dir).catch(() => { throw fail(409, 'Phiên đã tồn tại'); });
  const agent = b.agent == null ? null : agents.get(b.agent);
  if (!agent) return;
  const command = b.resume ? agent.resumeCommand(b.resume) : agent.command;
  await tmux('send-keys', '-t', target(b.name), command, 'Enter');
}

const resumeIdFor = async session => (session.agent ? agents.get(session.agent).resumeId(session) : null);
export const normalizeSnapshot = saved => ({
  at: saved?.at || 0,
  sessions: Array.isArray(saved?.sessions) ? saved.sessions : [],
  pending: Array.isArray(saved?.pending) ? saved.pending : [],
});
const readSnap = async () => normalizeSnapshot(await store.read('sessions.json'));
const updateSnap = change => store.update('sessions.json', saved => change(normalizeSnapshot(saved)));

// Phiên trong bản lưu đã mất vì tmux khởi động lại sau lần lưu cuối (khởi động lại máy, tmux chết)
export function computePending(snap, present, serverStart) {
  const lost = serverStart > snap.at ? snap.sessions : [];
  const seen = new Set();
  return [...snap.pending, ...lost].filter(x => !present.has(x.name) && !seen.has(x.name) && seen.add(x.name));
}
async function pendingRestore() {
  const [snap, list, start] = await Promise.all([readSnap(), sessions(), serverStartTime()]);
  return computePending(snap, new Set(list.map(x => x.name)), start);
}
// Lưu danh sách phiên 30 giây một lần. tmux trống (vừa khởi động lại) thì không ghi đè bản đã lưu
async function snapshot() {
  const list = await sessions();
  if (!list.length) return;
  const serverStart = await serverStartTime();
  const present = new Set(list.map(x => x.name));
  const current = await Promise.all(list.map(async s => ({
    name: s.name, dir: s.dir, agent: s.agent, resume: await resumeIdFor(s).catch(() => null),
  })));
  await updateSnap(snap => ({
    at: Date.now(),
    sessions: current,
    pending: computePending(snap, present, serverStart),
  }));
}

// ---------- Giám sát ttyd ----------
// ttyd 1.7.7 không dọn client tmux của kết nối đứt đột ngột (điện thoại ngủ, mất sóng): mỗi client kẹt
// giữ một pty, tới giới hạn file thì ttyd không mở được terminal mới. Chỉ khởi động lại ttyd mới dọn được.
// Đếm con "mồ côi" = con của ttyd không còn là client đang gắn vào phiên nào (chạy cả macOS lẫn Linux).
export function orphanCount(psOut, ttydPid, attachedPids) {
  return psOut.split('\n').map(l => l.trim().split(/\s+/)).filter(([ppid, pid]) => ppid === ttydPid && !attachedPids.has(pid)).length;
}
async function ttydWatchdog() {
  const pgrep = await run('pgrep', ['-f', `ttyd .*-p ${config.ttydPort}`]).catch(() => ({ stdout: '' }));
  const pid = pgrep.stdout.trim().split('\n')[0];
  if (!pid) return;
  const attached = new Set((await tmux('list-clients', '-F', '#{client_pid}').catch(() => ({ stdout: '' }))).stdout.split('\n').filter(Boolean));
  const orphans = orphanCount((await run('ps', ['-A', '-o', 'ppid=,pid='], { maxBuffer: 8e6 })).stdout, pid, attached);
  // Lúc không ai mở terminal thì dọn sớm; đang có người dùng thì chỉ dọn khi sắp chạm giới hạn (terminal tự nối lại)
  if (orphans < 20 || (attached.size && orphans < 150)) return;
  console.log(`ttyd: ${orphans} client kẹt, ${attached.size} đang dùng → khởi động lại ttyd`);
  if (process.platform === 'darwin') await run('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/vn.termi.ttyd`]);
  else await run('systemctl', ['--user', 'restart', 'termi-ttyd']);
}

// ---------- API ----------
const routes = {
  'GET /api/sessions': () => sessions(),
  // Thư mục gợi ý: phiên đang mở, nơi từng chạy Claude, rồi các repo git
  async 'GET /api/dirs'() {
    const [s, h, r] = await Promise.all([sessions(), history().catch(() => []), repos()]);
    const recent = [];
    for (const d of new Set([...s.map(x => x.dir), ...h.map(x => x.cwd), ...r])) if (await inRoots(d)) recent.push(d);
    return { roots: allowedRoots, recent };
  },
  'GET /api/history': q => history(q.get('dir') || undefined),
  // Cây project (giống Claude Code desktop): phiên đang chạy + hội thoại cũ, gom theo thư mục
  async 'GET /api/projects'() {
    const [list, hist] = await Promise.all([sessions(), history(undefined, 250)]);
    const map = new Map();
    const get = dir => map.get(dir) || map.set(dir, { dir, sessions: [], conversations: [], last: 0 }).get(dir);
    for (const x of list) { const p = get(x.dir); p.sessions.push(x.name); p.last = Math.max(p.last, x.activity * 1000); }
    for (const h of hist) { const p = get(h.cwd); if (p.conversations.length < 20) p.conversations.push(h); p.last = Math.max(p.last, h.mtime); }
    // Chỉ thư mục còn tồn tại và nằm trong TERMI_ROOTS (mở lại hội thoại cần vào được thư mục)
    const ok = await Promise.all([...map.values()].map(async p => (await inRoots(p.dir)) && p));
    return ok.filter(Boolean).sort((a, b) => b.sessions.length - a.sessions.length || b.last - a.last);
  },
  'GET /api/agents': () => agents.installed(),
  'GET /api/usage': q => usage(q.get('session')),
  'GET /api/machines': async () => (await machines()).map(({ dns, ...m }) => m),

  async 'POST /api/sessions'(_, b) {
    await createSession(b);
    snapshot().catch(() => {});
    return { ok: true };
  },
  // Chữ trong phiên (kể cả phần đã cuộn qua) dạng văn bản thường để chọn và copy trên điện thoại
  async 'GET /api/capture'(q) {
    const name = q.get('session');
    if (!validName(name)) throw fail(400, 'Phiên không hợp lệ');
    const lines = Math.min(5000, Math.max(50, Number(q.get('lines')) || 1000));
    const s = (await sessions()).find(x => x.name === name);
    if (!s) throw fail(404, 'Không tìm thấy phiên');
    const adapter = s.agent && agents.get(s.agent);
    const f = adapter && await adapter.transcriptFile(s.dir, s.agentPid);
    if (f) {
      const msgs = transcriptMessages(adapter, await readTail(f, 4 * 1024 * 1024));
      const who = m => m.who === 'user' ? '▶ Bạn' : '◆ ' + adapter.name;
      if (msgs.length) return { text: msgs.map(m => `${who(m)}\n${m.text}`).join('\n\n────────\n\n') };
    }
    const out = await tmux('capture-pane', '-p', '-J', '-S', `-${lines}`, '-t', target(name));
    return { text: out.stdout.replace(/\s+$/, '') };
  },
  // Khung tmux theo kích thước thiết bị đang xem. Mặc định tmux chỉ đổi khi có phím gõ, nên thiết bị
  // còn lại thấy khung thừa (dấu chấm) hoặc bị cắt khi điện thoại và máy tính cùng mở một phiên.
  async 'POST /api/resize'(_, b) {
    const cols = Number(b.cols), rows = Number(b.rows);
    if (!validName(b.session) || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 10 || cols > 1000 || rows < 3 || rows > 500)
      throw fail(400, 'Kích thước không hợp lệ');
    await tmux('resize-window', '-t', target(b.session), '-x', String(cols), '-y', String(rows)).catch(() => {});
    return { ok: true };
  },
  // Bắt tmux vẽ lại màn hình cho mọi thiết bị đang xem phiên: kết nối còn sống thì sẽ nhận được chữ ngay
  async 'POST /api/refresh'(_, b) {
    if (!validName(b.session)) throw fail(400, 'Phiên không hợp lệ');
    const out = await tmux('list-clients', '-t', target(b.session), '-F', '#{client_name}').catch(() => ({ stdout: '' }));
    for (const c of out.stdout.split('\n').filter(Boolean)) await tmux('refresh-client', '-t', c).catch(() => {});
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
    // Bạn chủ động đóng: bỏ khỏi bản lưu ngay để không bị khôi phục sau khi khởi động lại
    const keep = x => x.name !== b.name;
    await updateSnap(snap => ({ ...snap, sessions: snap.sessions.filter(keep), pending: snap.pending.filter(keep) }));
    return { ok: true };
  },
  // Phiên có trước lần khởi động lại máy (tmux trống) chờ khôi phục
  'GET /api/restore': () => pendingRestore(),
  async 'POST /api/restore'() {
    const done = [], failed = [];
    for (const x of await pendingRestore()) {
      try { await createSession(x); done.push(x.name); } catch (e) { failed.push(`${x.name}: ${e.message}`); }
    }
    await updateSnap(snap => ({ ...snap, pending: [] }));
    await snapshot();
    return { done, failed };
  },
  async 'POST /api/restore/dismiss'() {
    await updateSnap(snap => ({ ...snap, pending: [] }));
    return { ok: true };
  },

  async 'POST /api/send'(_, b) {
    if (!validName(b.session)) throw fail(400, 'Phiên không hợp lệ');
    const t = target(b.session);
    if (b.key !== undefined) {
      if (!validKey(b.key)) throw fail(400, 'Phím không hỗ trợ');
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
    const marks = await gitMarks(dir);
    for (const e of list) if (e && marks.has(e.name)) e.git = marks.get(e.name);
    return { dir, parent: await inRoots(path.dirname(dir)) && path.dirname(dir),
      entries: list.filter(Boolean).sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name)) };
  },
  async 'GET /api/file'(q) {
    const f = await need(q.get('path'), 'file');
    const ext = path.extname(f).toLowerCase();
    if (IMAGES[ext]) return { path: f, image: true };
    const fh = await fs.open(f);
    const buf = Buffer.alloc(MAX_OUTPUT_CHARS + 1);
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
      git(dir, 'log', '--all', '--date-order', '-n', '200', `--format=${LOG_FORMAT}`).catch(() => ''),
      git(dir, 'branch', '-a', '--format=%(refname:short)').catch(() => ''),
    ]);
    const commits = parseLog(log);
    return { dir, ...parseStatus(status), commits, graph: graphLayout(commits), branches: branches.split('\n').filter(b => b && !b.endsWith('/HEAD') && b !== 'origin') };
  },
  // rev = commit; file = diff một file (staged=1 cho phần đã stage); không có gì = mọi thay đổi chưa commit
  async 'GET /api/show'(q) {
    const dir = await needRepo(q.get('dir'));
    const rev = q.get('rev'), file = q.get('file');
    if (rev && !validRev(rev)) throw fail(400, 'Mã commit không hợp lệ');
    if (file !== null && !validGitPath(file)) throw fail(400, 'File không hợp lệ');
    if (file) return { text: clip(await git(dir, 'diff', ...(q.get('staged') ? ['--cached'] : []), '--', file)) || '(không có thay đổi)' };
    // Commit, hoặc mọi thay đổi chưa commit: kèm danh sách file +/− để hiện tóm tắt trước diff
    const range = rev ? ['show', '--format=', rev] : ['diff', 'HEAD'];
    const [patch, numstat, meta] = await Promise.all([
      git(dir, ...range, '--patch').catch(() => git(dir, 'diff', '--patch')),
      git(dir, ...range, '--numstat').catch(() => git(dir, 'diff', '--numstat')),
      rev ? git(dir, 'log', '-1', '--format=%H%x1f%an%x1f%at%x1f%s%x1f%b', rev) : '',
    ]);
    const [hash, author, at, subject, body] = meta.split('\x1f');
    return {
      text: clip(patch) || '(không có thay đổi)',
      files: parseNumstat(numstat),
      commit: rev ? { hash, author, t: Number(at) * 1000, subject, body: (body || '').trim() } : null,
    };
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
  'GET /api/events': () => events,
  'GET /api/notify': () => notifyPrefs,
  async 'POST /api/notify'(_, b) {
    const q = b.quiet || {};
    if (!validTime(q.from ?? '23:00') || !validTime(q.to ?? '07:00')) throw fail(400, 'Giờ không hợp lệ (HH:MM)');
    const muted = Array.isArray(b.muted) ? b.muted.filter(x => typeof x === 'string' && x.length < 120).slice(0, 200) : [];
    notifyPrefs = { waiting: !!b.waiting, done: !!b.done, quiet: { on: !!q.on, from: q.from || '23:00', to: q.to || '07:00' }, muted };
    await store.write('notify.json', notifyPrefs);
    return notifyPrefs;
  },
  // Thao tác nhanh tự sửa: lưu trên máy chủ để mọi thiết bị dùng chung; null = dùng mặc định
  'GET /api/quick': () => store.read('quick.json'),
  async 'POST /api/quick'(_, b) {
    if (b.items === null) { await store.remove('quick.json'); return null; }
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    if (!Array.isArray(b.items) || b.items.length > 30) throw fail(400, 'Danh sách không hợp lệ');
    const items = b.items.map(x => ({ emoji: str(x.emoji, 8), name: str(x.name, 40), desc: str(x.desc, 80), text: str(x.text, 2000), ask: !!x.ask }))
      .filter(x => x.name && x.text);
    await store.write('quick.json', items);
    return items;
  },
  // Menu chọn nhiều: đưa con trỏ tới Submit rồi Enter (bấm ↓ dần nếu Submit đang khuất do cuộn)
  async 'POST /api/menu-submit'(_, b) {
    if (!validName(b.session)) throw fail(400, 'Phiên không hợp lệ');
    const t = target(b.session);
    for (let i = 0; i < 25; i++) {
      const screen = (await tmux('capture-pane', '-p', '-J', '-t', t)).stdout;
      const d = stepsToSubmit(screen);
      if (d === 0) { await tmux('send-keys', '-t', t, 'Enter'); return { ok: true }; }
      await tmux('send-keys', '-t', t, ...(d === null ? ['Down'] : Array(Math.abs(d)).fill(d > 0 ? 'Down' : 'Up')));
      await new Promise(r => setTimeout(r, 150));
    }
    throw fail(409, 'Không tìm thấy nút Submit trong menu');
  },
  // Chế độ Chat: các tin nhắn gần nhất của hội thoại trong phiên
  async 'GET /api/chat'(q) {
    const name = q.get('session');
    if (!validName(name)) throw fail(400, 'Phiên không hợp lệ');
    const s = (await sessions()).find(x => x.name === name);
    if (!s) throw fail(404, 'Không tìm thấy phiên');
    const adapter = s.agent && agents.get(s.agent);
    const f = adapter && await adapter.transcriptFile(s.dir, s.agentPid);
    const limit = Math.min(200, Math.max(10, Number(q.get('limit')) || 80));
    const items = f ? chatItems(adapter, await readTail(f, 4 * 1024 * 1024), limit) : [];
    return { agent: s.agent, state: s.state, items };
  },
  // Trang Cài đặt
  async 'GET /api/info'() {
    const pkgFile = path.join(config.publicDir, '..', 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgFile, 'utf8').catch(() => '{}'));
    const statusline = path.join(config.dataDir, 'claude-statusline.mjs');
    const claudeUsage = await fs.access(statusline).then(() => true, () => false);
    return {
      version: pkg.version || '?',
      roots: allowedRoots,
      host: os.hostname(),
      platform: process.platform,
      claudeUsage,
      agents: await agents.installed(),
    };
  },
  async 'POST /api/push/sub'(_, b) {
    let u;
    try { u = new URL(b.endpoint); } catch { throw fail(400, 'Endpoint không hợp lệ'); }
    if (u.protocol !== 'https:' || !PUSH_HOSTS.test(u.hostname)) throw fail(400, 'Dịch vụ push không được hỗ trợ');
    subs = [...subs.filter(s => s.endpoint !== b.endpoint), { endpoint: b.endpoint }];
    await store.write('subs.json', subs);
    console.log('push: đăng ký mới', u.hostname, `(tổng ${subs.length})`);
    return { ok: true };
  },
  'POST /api/push/test': async () => ({ results: await push('termi', 'Thông báo hoạt động 👍', '') }),
};

// Upload: body là nội dung file thô, lưu vào ~/.termi/uploads và trả đường dẫn để chèn vào prompt
async function upload(req) {
  const raw = decodeURIComponent(req.headers['x-filename'] || 'file');
  const name = path.basename(raw).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-80) || 'file';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const dest = path.join(config.dataDir, 'uploads', `${stamp}-${crypto.randomBytes(3).toString('hex')}-${name}`);
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_UPLOAD_BYTES) req.destroy(fail(413, 'File quá lớn (tối đa 25MB)'));
  });
  try { await pipeline(req, createWriteStream(dest, { flags: 'wx' })); }
  catch (e) { await fs.rm(dest, { force: true }); throw e.status ? e : fail(400, 'Upload lỗi'); }
  return { path: dest };
}

const STATIC_FILES = {
  '/': ['index.html', 'text/html'], '/manifest.json': ['manifest.json', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'], '/sw.js': ['sw.js', 'text/javascript'],
  '/offline.html': ['offline.html', 'text/html'], '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'], '/icon-maskable.png': ['icon-maskable.png', 'image/png'],
  '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'],
};
const FONT_FILE = /^[a-z0-9-]+\.(woff2|css)$/;

async function loadStaticFiles(publicDir) {
  const files = { ...STATIC_FILES };
  const fonts = await fs.readdir(path.join(publicDir, 'fonts')).catch(() => []);
  for (const font of fonts.filter(f => FONT_FILE.test(f))) {
    files['/fonts/' + font] = ['fonts/' + font, font.endsWith('.css') ? 'text/css' : 'font/woff2'];
  }
  return files;
}

async function readBody(req) {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 64_000) throw fail(413, 'Body quá lớn'); }
  try { return JSON.parse(s || '{}'); } catch { throw fail(400, 'JSON không hợp lệ'); }
}

// ---------- Chuyển tiếp /term/* sang ttyd ----------
// Terminal cùng origin với app thì app mới chỉnh được cỡ chữ, cuộn bằng cảm ứng và tự kết nối lại.
export const isTermPath = p => p === '/term' || p.startsWith('/term/');

function proxyHttp(req, res) {
  const upstream = { host: '127.0.0.1', port: config.ttydPort, path: req.url, method: req.method, headers: req.headers };
  const up = http.request(upstream, r => {
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

// ---------- Ai được vào ----------
// tailscale serve gắn danh tính người gửi vào Tailscale-User-Login và ghi đè header giả mạo (đã thử).
// Chỉ chủ máy (hoặc TERMI_ALLOWED_USERS) được vào; thiết bị gắn tag, máy được chia sẻ và Funnel
// không có danh tính đó nên bị chặn. Gọi thẳng localhost trên chính máy này thì không qua serve.
let allowedCache = null;
async function allowedUsers() {
  if (config.allowedUsers) return config.allowedUsers;
  if (!allowedCache) {
    try {
      const st = await tailscaleStatus();
      const login = st.User?.[String(st.Self?.UserID)]?.LoginName;
      if (login) allowedCache = [login.toLowerCase()];
    } catch {}
  }
  return allowedCache || []; // không xác định được chủ máy: chặn hết request qua tailnet (fail closed)
}
export function isAllowed(headers, allowed) {
  const login = headers['tailscale-user-login'];
  if (!login) return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(headers.host || ''); // chỉ gọi thẳng trên máy này
  return allowed.includes(String(login).toLowerCase());
}
// WebSocket không bị CORS chặn: trang lạ mở được WebSocket tới terminal. Chỉ nhận Origin của chính app.
export const sameOrigin = h => !h.origin || h.origin === `https://${h.host}` || h.origin === `http://${h.host}`;

async function proxyUpgrade(req, socket, head) {
  if (!validHost(req.headers.host) || !sameOrigin(req.headers) || !isAllowed(req.headers, await allowedUsers())) return socket.destroy();
  const peer = matchPeer(req.url);
  if (peer) {
    const dns = await peerDns(peer.id);
    if (!dns || !isTermPath(new URL(peer.rest, 'http://x').pathname)) return socket.destroy();
    return pipeUpgrade(req, socket, head, cb => tls.connect({ host: dns, port: 443, servername: dns }, cb), peer.rest, dns);
  }
  if (!isTermPath(new URL(req.url, 'http://x').pathname)) return socket.destroy();
  pipeUpgrade(req, socket, head, cb => net.connect(config.ttydPort, '127.0.0.1', cb), req.url, req.headers.host);
}

// HTTP sang termi máy khác. Bỏ x-termi-build: phiên bản giao diện máy kia không liên quan tới trang đang mở
function proxyPeer(req, res, dns, rest) {
  const headers = { ...req.headers, host: dns };
  if (headers.origin) headers.origin = `https://${dns}`; // an toàn: handle() đã chặn Origin lạ trước khi tới đây
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
  if (!isAllowed(req.headers, await allowedUsers())) throw fail(403, 'Tài khoản Tailscale này không được phép dùng termi trên máy này');
  if (!sameOrigin(req.headers)) throw fail(403, 'Origin không hợp lệ');
  const peer = matchPeer(req.url);
  if (peer) {
    const dns = await peerDns(peer.id);
    if (!dns) throw fail(404, 'Không tìm thấy máy, hoặc máy đó chưa chạy termi');
    return proxyPeer(req, res, dns, peer.rest);
  }
  const url = new URL(req.url, 'http://x');
  if (isTermPath(url.pathname)) return proxyHttp(req, res);
  const st = req.method === 'GET' && staticFiles[url.pathname];
  if (st) {
    const file = await fs.readFile(path.join(config.publicDir, st[0]));
    // Không cho trang khác nhúng termi (clickjacking)
    res.writeHead(200, { 'content-type': st[1], 'cache-control': st[0].endsWith('.woff2') ? 'public, max-age=31536000, immutable' : 'no-cache', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'", 'referrer-policy': 'no-referrer' });
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
  const build = String((await fs.stat(path.join(config.publicDir, 'index.html'))).mtimeMs);
  res.writeHead(200, { 'content-type': 'application/json', 'x-termi-build': build });
  res.end(JSON.stringify(data));
}

function respondError(res, error) {
  if (!error.status) console.error(error);
  if (res.headersSent) return res.destroy();
  res.writeHead(error.status || 500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: error.status ? error.message : 'Lỗi máy chủ' }));
}

const every = (ms, name, task) => setInterval(() => task().catch(e => console.error(name, e.message)), ms);

export async function init(cfg) {
  config = cfg;
  allowedRoots = await resolveRoots(cfg.roots);
  await fs.mkdir(path.join(cfg.dataDir, 'uploads'), { recursive: true, mode: 0o700 });
  await fs.chmod(cfg.dataDir, 0o700);
  store = createStore(cfg.dataDir);
  agents = createAgents({ home: cfg.home, dataDir: cfg.dataDir });
  history = createHistory(agents);
  lastReply = createReplyReader();
  vapid = await loadVapidKeys();
  const savedSubs = await store.read('subs.json');
  subs = Array.isArray(savedSubs) ? savedSubs : [];
  notifyPrefs = { ...NOTIFY_DEFAULT, ...(await store.read('notify.json')) };
  staticFiles = await loadStaticFiles(cfg.publicDir);
}

export async function start(cfg) {
  await init(cfg);
  const server = http.createServer((req, res) => handle(req, res).catch(e => respondError(res, e)));
  server.on('upgrade', proxyUpgrade);
  await new Promise((resolve, reject) => server.once('error', reject).listen(cfg.port, cfg.host, resolve));
  console.log(`termi: http://${cfg.host}:${cfg.port}  roots=${allowedRoots.join(', ')}`);
  const timers = [
    every(3000, 'watch', watch),
    every(30_000, 'snapshot', snapshot),
    every(120_000, 'watchdog', ttydWatchdog),
    setTimeout(() => snapshot().catch(e => console.error('snapshot', e.message)), 5000),
  ];
  return {
    server,
    close: () => {
      timers.forEach(clearTimeout);
      return new Promise(resolve => server.close(resolve));
    },
  };
}
