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
// Phím số 1–9: chọn nhanh trong menu xác nhận của agent (menu nhận phím bấm thật, không nhận chữ dán vào)
export const KEYS = new Set(['Escape', 'C-c', 'C-d', 'Tab', 'BTab', 'Up', 'Down', 'Left', 'Right', 'Enter', 'PageUp', 'PageDown', ...'123456789']);
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
await fs.mkdir(UPLOADS, { recursive: true, mode: 0o700 });
await fs.chmod(DATA, 0o700); // ảnh tải lên, khoá VAPID: chỉ chủ tài khoản đọc được

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
    const args = m[3].split(/\s+/);
    const exe = /^(node|bun|deno)$/.test(path.basename(args[0])) ? args[1] || '' : args[0]; // agent viết bằng JS
    const agent = Object.keys(AGENTS).find(id => AGENTS[id].proc(exe));
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
    if (s.agent === 'claude' && s.agentPid && !s.convId) {
      const j = await claudeSessionInfo(s.agentPid); // hội thoại đang chạy trong phiên + tên của nó trong Claude
      if (validUuid(j?.sessionId)) s.convId = j.sessionId;
      if (j?.name && j.nameSource !== 'derived') s.title = String(j.name).slice(0, 120); // tên tự sinh (vd. termi-fb) thì bỏ
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
      const r = await lastReply(s.agent, s.dir, s.agentPid).catch(() => null);
      if (r?.text && s.state !== 'waiting') { s.preview = r.text; s.previewKind = 'reply'; }
      // Model: tên hiển thị từ statusline nếu có (vd. "Opus 5.5"), không thì từ câu trả lời gần nhất
      const live = s.convId && (await claudeUsageFile())?.sessions?.[s.convId];
      s.model = live?.model || prettyModel(r?.model);
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
    if (o.type === 'custom-title' && o.customTitle) h.custom = o.customTitle; // tên bạn đặt cho hội thoại trong Claude
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
// dir: chỉ lấy hội thoại của thư mục đó (đọc nhiều file hơn vì cwd chỉ biết sau khi đọc)
// Bộ nhớ đệm theo file + thời điểm sửa: thư mục và tiêu đề của một hội thoại không đổi
const historyCache = new Map();
async function history(dir, limit = 40) {
  const files = [];
  for (const [agent, { dir, accept }] of Object.entries(HISTORY))
    for (const f of await fs.readdir(dir, { recursive: true }).catch(() => []))
      if (f.endsWith('.jsonl') && accept(f)) files.push({ agent, f: path.join(dir, f) });
  const stats = await Promise.all(files.map(x => fs.stat(x.f).then(s => ({ ...x, t: s.mtimeMs }), () => null)));
  const recent = stats.filter(Boolean).sort((a, b) => b.t - a.t).slice(0, dir ? 300 : limit);
  return (await Promise.all(recent.map(async ({ agent, f, t }) => {
    const c = historyCache.get(f);
    if (c && c.t === t) return c.entry;
    const h = { id: agent === 'claude' ? path.basename(f, '.jsonl') : null };
    for (const line of await readHead(f)) {
      let o; try { o = JSON.parse(line); } catch { continue; }
      HISTORY[agent].parse(o, h);
      if (h.id && h.cwd && h.title && (agent !== 'claude' || h.custom)) break;
    }
    const entry = validUuid(h.id) && h.cwd && { agent, id: h.id, cwd: h.cwd, title: (h.custom || h.title || '(không tiêu đề)').trim().slice(0, 160), mtime: t };
    historyCache.set(f, { t, entry });
    return entry;
  }))).filter(h => h && (!dir || h.cwd === dir)).slice(0, dir ? 40 : limit);
}

// Agent nào có cài trên máy này (tìm trong PATH)
async function installedAgents() {
  const dirs = (process.env.PATH || '').split(':').filter(Boolean);
  const ok = await Promise.all(Object.entries(AGENTS).map(async ([id, a]) => {
    for (const d of dirs) if (await fs.access(path.join(d, a.cmd), fs.constants.X_OK).then(() => true, () => false)) return { id, name: a.name };
  }));
  return ok.filter(Boolean);
}

// ---------- Usage: hạn mức gói agent, token của phiên, tài nguyên máy ----------
async function readTail(file, bytes = 512 * 1024) {
  const fh = await fs.open(file);
  try {
    const { size } = await fh.stat();
    const len = Math.min(bytes, size), buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    return buf.toString().split('\n').reverse(); // dòng mới nhất trước
  } finally { await fh.close(); }
}
const lastJson = (lines, pick) => {
  for (const l of lines) { let o; try { o = JSON.parse(l); } catch { continue; } const v = pick(o); if (v) return v; }
  return null;
};
async function newestFiles(dir, accept, limit) {
  const files = (await fs.readdir(dir, { recursive: true }).catch(() => [])).filter(accept).map(f => path.join(dir, f));
  const st = await Promise.all(files.map(f => fs.stat(f).then(s => ({ f, t: s.mtimeMs }), () => null)));
  return st.filter(Boolean).sort((a, b) => b.t - a.t).slice(0, limit).map(x => x.f);
}
const CODEX_DIR = path.join(os.homedir(), '.codex', 'sessions');
const codexFiles = () => newestFiles(CODEX_DIR, f => path.basename(f).startsWith('rollout-') && f.endsWith('.jsonl'), 30);
const pctWindow = w => w && { pct: Math.round(w.used_percent), minutes: w.window_minutes, resetsAt: w.resets_at * 1000 };

// Codex ghi hạn mức (rate_limits) vào sự kiện token_count của file phiên mới nhất
async function codexLimits() {
  for (const f of await codexFiles()) {
    const r = lastJson(await readTail(f), o => o.payload?.type === 'token_count' && o.payload.rate_limits);
    if (r) return { plan: r.plan_type, primary: pctWindow(r.primary), secondary: pctWindow(r.secondary) };
  }
  return null;
}

// Claude: hạn mức chỉ có qua statusline (scripts/claude-statusline.mjs ghi ra file này).
// Tài liệu: chỉ gói Pro/Max/Ultra mới có rate_limits; mỗi khung có thể vắng.
const claudeUsageFile = () => fs.readFile(path.join(DATA, 'claude-usage.json'), 'utf8').then(JSON.parse, () => null);
async function claudeLimits() {
  const r = (await claudeUsageFile())?.rate_limits;
  if (!r) return null;
  const w = x => x && x.resets_at * 1000 > Date.now() && { pct: Math.round(x.used_percentage), resetsAt: x.resets_at * 1000 };
  return { fiveHour: w(r.five_hour), sevenDay: w(r.seven_day), at: r.at };
}

// File hội thoại mới nhất của agent ở đúng thư mục
// Claude Code ghi ~/.claude/sessions/<pid>.json (có sessionId) cho mỗi tiến trình: biết chính xác hội thoại
// của từng phiên, kể cả khi nhiều phiên cùng thư mục.
// shortcut: file nội bộ, không có trong tài liệu; Claude Code đổi cách lưu thì quay về đoán theo thư mục
const claudeSessionInfo = pid => pid ? fs.readFile(path.join(os.homedir(), '.claude', 'sessions', `${pid}.json`), 'utf8').then(JSON.parse, () => null) : null;
async function claudeSessionId(pid) {
  const j = await claudeSessionInfo(pid);
  return validUuid(j?.sessionId) ? j.sessionId : null;
}
// "claude-opus-5-5" → "Opus 5.5"; model khác giữ nguyên
export const prettyModel = id => {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$|\[)/.exec(id || '');
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}` : id || null;
};
const claudeProjectDir = cwd => path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
async function transcriptFile(agent, cwd, pid) {
  if (agent === 'claude') {
    const sid = await claudeSessionId(pid);
    if (sid) {
      const f = path.join(claudeProjectDir(cwd), `${sid}.jsonl`);
      if (await fs.access(f).then(() => true, () => false)) return f;
    }
    // Không biết pid: lấy hội thoại mới nhất của thư mục (tên thư mục: ký tự không phải chữ/số thành '-')
    return (await newestFiles(claudeProjectDir(cwd), x => x.endsWith('.jsonl') && !x.includes(path.sep), 1))[0] || null;
  }
  if (agent === 'codex') {
    for (const f of await codexFiles()) {
      const meta = lastJson((await readHead(f, 64 * 1024)).reverse(), o => o.type === 'session_meta' && o.payload);
      if (meta?.cwd === cwd) return f;
    }
  }
  return null;
}

// Câu trả lời gần nhất của agent, dạng chữ thường (bỏ ký hiệu markdown), có bộ nhớ đệm:
// danh sách phiên được gọi 3 giây một lần
const fileCache = new Map(), replyCache = new Map();
async function lastReply(agent, cwd, pid) {
  const key = `${agent}:${cwd}:${pid || ''}`;
  let fc = fileCache.get(key);
  if (!fc || Date.now() - fc.t > 15_000) fileCache.set(key, fc = { t: Date.now(), file: await transcriptFile(agent, cwd, pid) });
  if (!fc.file) return null;
  const mtime = (await fs.stat(fc.file).catch(() => null))?.mtimeMs;
  const rc = replyCache.get(fc.file);
  if (rc && rc.mtime === mtime) return rc;
  const lines = await readTail(fc.file, 1024 * 1024);
  const msg = transcriptMessages(agent, lines, 12).filter(m => m.who === 'assistant').pop();
  const model = lastJson(lines, o => agent === 'claude' ? o.type === 'assistant' && o.message?.model : o.type === 'turn_context' && o.payload?.model);
  const items = chatItems(agent, lines, 6), last = items.at(-1);
  const lastTool = last?.kind === 'tools' ? last.steps.at(-1) : null; // bước mới nhất (nếu chưa có câu trả lời sau nó)
  const replyAt = items.filter(x => x.kind === 'msg' && x.who === 'assistant').at(-1)?.t || null;
  const out = { mtime, text: msg && plainText(msg.text).slice(0, 300), model, lastTool, replyAt };
  replyCache.set(fc.file, out);
  return out;
}
export const plainText = md => md
  .replace(/```[\s\S]*?```/g, ' ')            // bỏ khối code
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')      // [chữ](link) → chữ
  .replace(/^\s*(#{1,6}|[-*>]|\d+\.)\s+/gm, '') // tiêu đề, gạch đầu dòng, trích dẫn
  .replace(/[*_`~|]/g, '')                      // nhấn mạnh, code, bảng
  .replace(/\s+/g, ' ').trim();

// Token của phiên
async function sessionTokens(agent, cwd, pid) {
  if (agent === 'claude') {
    const all = (await claudeUsageFile())?.sessions || {}, sid = await claudeSessionId(pid);
    const live = (sid && all[sid]) || all[cwd]; // statusline lưu theo mã hội thoại (và theo thư mục cho bản cũ)
    if (live && Date.now() - live.at < 30 * 60_000) return { model: live.model, context: live.tokens, window: live.size, pct: live.pct };
  }
  const f = await transcriptFile(agent, cwd, pid);
  if (!f) return null;
  return lastJson(await readTail(f), agent === 'claude'
    ? o => {
      const u = o.type === 'assistant' && o.message?.usage;
      return u && { model: o.message.model, context: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) };
    }
    : o => {
      const i = o.payload?.type === 'token_count' && o.payload.info;
      return i && { context: i.last_token_usage?.total_tokens, window: i.model_context_window, total: i.total_token_usage?.total_tokens };
    });
}

// Tin nhắn gần nhất (người dùng + agent) dạng văn bản: agent chạy màn hình phụ nên tmux không giữ lịch sử
// Tóm tắt một lần gọi công cụ của agent thành [việc, chi tiết] ngắn để hiện trong Chat
export function toolSummary(name, input) {
  let i = input || {};
  if (typeof i === 'string') { try { i = JSON.parse(i); } catch { i = { raw: i }; } }
  const base = p => (p ? String(p).split('/').pop() : '');
  const out = (() => {
    switch (name) {
      case 'Read': return ['Đọc', base(i.file_path)];
      case 'Edit': case 'MultiEdit': case 'NotebookEdit': return ['Sửa', base(i.file_path || i.notebook_path)];
      case 'Write': return ['Tạo', base(i.file_path)];
      case 'Bash': return ['Chạy', i.description || i.command];
      case 'Grep': return ['Tìm', i.pattern];
      case 'Glob': return ['Tìm file', i.pattern];
      case 'WebFetch': return ['Đọc web', i.url];
      case 'WebSearch': return ['Tìm web', i.query];
      case 'Agent': case 'Task': return ['Giao việc', i.description];
      case 'TodoWrite': return ['Cập nhật danh sách việc', ''];
      case 'AskUserQuestion': return ['Hỏi bạn', i.questions?.[0]?.question];
      default: { // Codex: exec / shell với lệnh bên trong
        const cmd = /cmd:\s*"((?:[^"\\]|\\.){1,200})/.exec(i.raw || '')?.[1] || (Array.isArray(i.command) ? i.command.join(' ') : i.command || i.cmd);
        return [name === 'exec' || name === 'shell' ? 'Chạy' : name, cmd || ''];
      }
    }
  })();
  return { verb: out[0], detail: String(out[1] || '').replace(/\s+/g, ' ').trim().slice(0, 140) };
}

// Chat: tin nhắn + các bước agent làm (gọi công cụ), các bước liền nhau gộp thành một thẻ. lines: mới nhất trước
export function chatItems(agent, lines, limit = 80) {
  const raw = [];
  for (const l of lines) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    const t = Date.parse(o.timestamp) || null, ev = [];
    if (agent === 'claude' && (o.type === 'user' || o.type === 'assistant') && !o.isMeta && !o.isSidechain) {
      const c = o.message?.content;
      const items = typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];
      for (const x of items) {
        if (x.type === 'text' && x.text?.trim() && !x.text.startsWith('<')) ev.push({ who: o.type, text: x.text.trim(), t });
        else if (x.type === 'tool_use' && o.type === 'assistant') ev.push({ tool: toolSummary(x.name, x.input), t });
      }
    } else if (agent === 'codex' && o.type === 'response_item') {
      const p = o.payload || {};
      if (p.type === 'message' && (p.role === 'user' || p.role === 'assistant')) {
        const text = (p.content || []).filter(x => x.type === 'input_text' || x.type === 'output_text').map(x => x.text).join('\n').trim();
        if (text && !text.startsWith('<') && !text.startsWith('# AGENTS.md')) ev.push({ who: p.role, text, t });
      } else if (p.type === 'function_call' || p.type === 'custom_tool_call') ev.push({ tool: toolSummary(p.name, p.arguments ?? p.input), t });
    }
    raw.push(...ev.reverse()); // trong một dòng: giữ đúng thứ tự khi đảo ngược cả danh sách
    if (raw.filter(e => e.who).length >= limit) break;
  }
  const items = [];
  for (const e of raw.reverse()) {
    const prev = items.at(-1);
    if (e.tool && prev?.kind === 'tools') { prev.steps.push(e.tool); prev.t = e.t; }
    else if (e.tool) items.push({ kind: 'tools', steps: [e.tool], t: e.t });
    else items.push({ kind: 'msg', who: e.who, text: e.text, t: e.t });
  }
  return items;
}

// Màn hình chờ xác nhận: câu hỏi và các lựa chọn đánh số ("❯ 1. Yes", "  2. No, and tell Claude…")
// Menu chọn nhiều (ô tích, dòng Submit): các ô + đã tích chưa + vị trí con trỏ so với Submit
export function parseMulti(screen) {
  const lines = screen.split('\n').map(l => l.replace(/[│┃]/g, '').trimEnd()).filter(l => l.trim()).slice(-24);
  const rows = [], options = [];
  let firstOpt = -1;
  lines.forEach((l, i) => {
    const sub = /^\s*([❯›>])?\s*Submit\s*$/.exec(l);
    const opt = /^\s*([❯›>])?\s*(\d+)[.)]\s+(?:\[([ xX✓✔]?)\]\s*)?(.+)$/.exec(l);
    if (sub) rows.push({ submit: true, cursor: !!sub[1] });
    else if (opt) {
      if (firstOpt < 0) firstOpt = i;
      rows.push({ cursor: !!opt[1] });
      if (opt[3] !== undefined && !/^Type something/i.test(opt[4])) options.push({ n: Number(opt[2]), label: opt[4].trim(), checked: /[xX✓✔]/.test(opt[3]) });
    }
  });
  if (!options.length || !rows.some(r => r.submit) && !lines.some(l => /more lines?/.test(l))) return {};
  const question = lines.slice(0, Math.max(0, firstOpt)).reverse().find(l => /\?\s*$/.test(l.trim()))?.trim() || null;
  return { multi: true, question, options };
}
// Số lần bấm ↓ (dương) / ↑ (âm) để đưa con trỏ tới Submit; null nếu chưa thấy Submit (danh sách đang cuộn)
export function stepsToSubmit(screen) {
  const rows = screen.split('\n').map(l => l.replace(/[│┃]/g, '')).filter(l => /^\s*([❯›>])?\s*(Submit|\d+[.)]\s)/.test(l));
  const cur = rows.findIndex(l => /^\s*[❯›>]/.test(l)), sub = rows.findIndex(l => /^\s*([❯›>])?\s*Submit\s*$/.test(l));
  return cur < 0 || sub < 0 ? null : sub - cur;
}

export function parseChoices(screen) {
  const lines = screen.split('\n').map(l => l.replace(/[│┃]/g, '').trimEnd()).filter(l => l.trim());
  const tail = lines.slice(-20), runs = [];
  // Tách các dãy 1., 2., 3.… liên tiếp; menu thật là dãy cuối có con trỏ ❯ (danh sách đánh số trong câu trả lời
  // của agent phía trên không có con trỏ, trước đây bị nhận nhầm thành lựa chọn)
  tail.forEach((l, i) => {
    const m = /^\s*([❯›>]\s*)?(\d)[.)]\s+(.+)$/.exec(l);
    if (!m) return;
    const n = Number(m[2]), run = runs.at(-1);
    if (n === 1) runs.push({ first: i, cursor: !!m[1], choices: [{ n, label: m[3].trim() }] });
    else if (run && n === run.choices.length + 1) { run.choices.push({ n, label: m[3].trim() }); run.cursor ||= !!m[1]; }
  });
  const pick = runs.filter(r => r.cursor).at(-1);
  if (!pick) return {};
  const { first, choices } = pick;
  // Menu chọn nhiều (ô tích [ ] / [✔], nút Submit) hoặc danh sách phải cuộn: bấm số chỉ tích/bỏ tích, không gửi;
  // để bạn thao tác trong terminal, không hiện nút (nếu không thanh nút cứ nháy theo menu cuộn)
  if (choices.some(c => /^\[[ xX✓✔]?\]/.test(c.label)) || tail.some(l => /^\s*(?:[❯›>]\s*)?Submit\s*$/.test(l) || /more lines?/.test(l))) return {};
  const question = tail.slice(0, first).reverse().find(l => /\?\s*$/.test(l.trim()))?.trim() || null;
  return { question, choices };
}

export function transcriptMessages(agent, lines, limit = 40) {
  const out = [];
  for (const l of lines) { // lines: mới nhất trước
    let o; try { o = JSON.parse(l); } catch { continue; }
    let who, text;
    if (agent === 'claude' && (o.type === 'user' || o.type === 'assistant') && !o.isMeta && !o.isSidechain) {
      const c = o.message?.content;
      text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
      who = o.type;
    } else if (agent === 'codex' && o.type === 'response_item' && o.payload?.type === 'message') {
      const p = o.payload;
      text = (p.content || []).filter(x => x.type === 'input_text' || x.type === 'output_text').map(x => x.text).join('\n');
      who = p.role;
    }
    if (!text?.trim() || text.startsWith('<') || text.startsWith('# AGENTS.md') || (who !== 'user' && who !== 'assistant')) continue;
    out.push({ who, text: text.trim(), t: Date.parse(o.timestamp) || null });
    if (out.length >= limit) break;
  }
  return out.reverse();
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
  const [machine, codex, claude, tokens] = await Promise.all([
    machineUsage(), codexLimits(), claudeLimits(), s?.agent ? sessionTokens(s.agent, s.dir, s.agentPid) : null]);
  return { machine, limits: { claude, codex }, session: s && { name: s.name, agent: s.agent, ...tokens } };
}

// Trạng thái git của từng mục trong thư mục (tab File): file → M/A/D/U, thư mục con có thay đổi → •
export function marksFromStatus(raw, rel) {
  const marks = new Map(), prefix = rel ? rel + '/' : '';
  for (const f of parseStatus('## x\0' + raw).files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length).replace(/\/$/, ''), slash = rest.indexOf('/');
    const code = f.x === '?' ? 'U' : (f.x !== ' ' ? f.x : f.y);
    if (slash < 0) marks.set(rest, code);
    else marks.set(rest.slice(0, slash), '•');
  }
  return marks;
}
async function gitMarks(dir) {
  try {
    const top = (await git(dir, 'rev-parse', '--show-toplevel')).trim();
    const raw = await git(top, 'status', '--porcelain=v1', '-z', '--untracked-files=normal');
    return marksFromStatus(raw, path.relative(top, dir));
  } catch { return new Map(); } // không phải repo git
}

// ---------- Git ----------
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
const git = (dir, ...a) => run('git', ['-C', dir, '-c', 'color.ui=never', ...a], { maxBuffer: 2e7, timeout: 90_000, env: GIT_ENV })
  .then(r => r.stdout, e => { throw fail(400, (e.stderr || e.message).trim().slice(0, 800)); });
async function needRepo(dir) {
  const d = await need(dir);
  return (await git(d, 'rev-parse', '--show-toplevel')).trim();
}

// git --numstat: "thêm<TAB>xoá<TAB>đường dẫn"; file nhị phân ghi "-"
export const parseNumstat = raw => raw.split('\n').filter(Boolean).map(l => {
  const [a, d, ...p] = l.split('\t');
  return { path: p.join('\t'), add: a === '-' ? null : Number(a), del: d === '-' ? null : Number(d) };
});

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
  if (gone.size) { subs = subs.filter(s => !gone.has(s.endpoint)); await saveJson('subs.json', subs); }
  return results;
}

// Theo dõi chuyển trạng thái của agent (máy này và các máy khác có termi) để báo:
// xong việc, hoặc đang chờ bạn xác nhận. Nhờ vậy chỉ cần bật thông báo ở một máy.
const prevState = new Map();
// Tuỳ chỉnh thông báo đẩy: loại cần báo, giờ yên lặng, phiên bị tắt (hộp thông báo trong app vẫn ghi đủ)
const NOTIFY_DEFAULT = { waiting: true, done: true, quiet: { on: false, from: '23:00', to: '07:00' }, muted: [] };
let notifyPrefs = { ...NOTIFY_DEFAULT, ...(await loadJson('notify.json', () => NOTIFY_DEFAULT)) };
const hm = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export function shouldPush(prefs, kind, key, now = new Date()) {
  if (!prefs[kind] || prefs.muted?.includes(key)) return false;
  if (prefs.quiet?.on) {
    const cur = now.getHours() * 60 + now.getMinutes(), from = hm(prefs.quiet.from), to = hm(prefs.quiet.to);
    if (from <= to ? cur >= from && cur < to : cur >= from || cur < to) return false; // khoảng qua nửa đêm
  }
  return true;
}
const validTime = t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

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
    const who = AGENTS[s.agent]?.name || 'Agent', label = s.m ? `[${s.m}] ${s.name}` : s.name;
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

// ---------- Tạo phiên và khôi phục sau khi khởi động lại máy ----------
async function createSession(b) {
  if (!validName(b.name)) throw fail(400, 'Tên phiên chỉ gồm chữ, số, - và _');
  if (b.resume != null && !validUuid(b.resume)) throw fail(400, 'Mã hội thoại không hợp lệ');
  if (b.agent != null && !Object.hasOwn(AGENTS, b.agent)) throw fail(400, 'Agent không hỗ trợ');
  if (b.resume != null && !AGENTS[b.agent]?.resume) throw fail(400, 'Agent này không mở lại được hội thoại cũ');
  const dir = await need(b.dir);
  await tmux('new-session', '-d', '-s', b.name, '-c', dir).catch(() => { throw fail(409, 'Phiên đã tồn tại'); });
  // Gõ lệnh vào shell để khi agent thoát vẫn còn shell, phiên không mất
  const a = AGENTS[b.agent];
  if (a) await tmux('send-keys', '-t', target(b.name), b.resume ? a.resume(b.resume) : a.cmd, 'Enter');
}

// Mã hội thoại để mở lại đúng chỗ: Claude qua ~/.claude/sessions/<pid>.json, Codex qua session_meta
async function resumeIdFor(s) {
  if (s.agent === 'claude') return claudeSessionId(s.agentPid);
  if (s.agent === 'codex') {
    const f = await transcriptFile('codex', s.dir);
    const meta = f && lastJson((await readHead(f, 64 * 1024)).reverse(), o => o.type === 'session_meta' && o.payload);
    return validUuid(meta?.id) ? meta.id : null;
  }
  return null;
}
const readSnap = async () => {
  const j = await fs.readFile(path.join(DATA, 'sessions.json'), 'utf8').then(JSON.parse, () => ({}));
  return { at: j.at || 0, sessions: Array.isArray(j.sessions) ? j.sessions : [], pending: Array.isArray(j.pending) ? j.pending : [] };
};
// Thời điểm tmux server bắt đầu chạy; không có server (vừa khởi động máy) → Infinity
const tmuxStart = () => tmux('display-message', '-p', '#{start_time}').then(r => Number(r.stdout) * 1000 || Infinity, () => Infinity);

// Phiên trong bản lưu đã mất vì tmux khởi động lại sau lần lưu cuối (khởi động lại máy, tmux chết)
export function computePending(snap, present, serverStart) {
  const lost = serverStart > snap.at ? snap.sessions : [];
  const seen = new Set();
  return [...snap.pending, ...lost].filter(x => !present.has(x.name) && !seen.has(x.name) && seen.add(x.name));
}
async function pendingRestore() {
  const [snap, list, start] = await Promise.all([readSnap(), sessions(), tmuxStart()]);
  return computePending(snap, new Set(list.map(x => x.name)), start);
}
// Lưu danh sách phiên 30 giây một lần. tmux trống (vừa khởi động lại) thì không ghi đè bản đã lưu
async function snapshot() {
  const list = await sessions();
  if (!list.length) return;
  const [snap, start] = await Promise.all([readSnap(), tmuxStart()]);
  const pending = computePending(snap, new Set(list.map(x => x.name)), start); // giữ phần chưa khôi phục
  const now = await Promise.all(list.map(async s => ({ name: s.name, dir: s.dir, agent: s.agent, resume: await resumeIdFor(s).catch(() => null) })));
  await saveJson('sessions.json', { at: Date.now(), sessions: now, pending });
}

// ---------- Giám sát ttyd ----------
// ttyd 1.7.7 không dọn client tmux của kết nối đứt đột ngột (điện thoại ngủ, mất sóng): mỗi client kẹt
// giữ một pty, tới giới hạn file thì ttyd không mở được terminal mới. Chỉ khởi động lại ttyd mới dọn được.
// Đếm con "mồ côi" = con của ttyd không còn là client đang gắn vào phiên nào (chạy cả macOS lẫn Linux).
export function orphanCount(psOut, ttydPid, attachedPids) {
  return psOut.split('\n').map(l => l.trim().split(/\s+/)).filter(([ppid, pid]) => ppid === ttydPid && !attachedPids.has(pid)).length;
}
async function ttydWatchdog() {
  const pid = (await run('pgrep', ['-f', `ttyd .*-p ${TTYD_PORT}`]).catch(() => ({ stdout: '' }))).stdout.trim().split('\n')[0];
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
    for (const d of new Set([...s.map(x => x.dir), ...h.map(x => x.cwd), ...r])) if (await safeDir(d)) recent.push(d);
    return { roots: ROOTS, recent };
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
    const ok = await Promise.all([...map.values()].map(async p => (await safeDir(p.dir)) && p));
    return ok.filter(Boolean).sort((a, b) => b.sessions.length - a.sessions.length || b.last - a.last);
  },
  'GET /api/agents': () => installedAgents(),
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
    const f = s.agent && await transcriptFile(s.agent, s.dir, s.agentPid);
    if (f) {
      const msgs = transcriptMessages(s.agent, await readTail(f, 4 * 1024 * 1024));
      const who = m => m.who === 'user' ? '▶ Bạn' : '◆ ' + AGENTS[s.agent].name;
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
    const snap = await readSnap();
    await saveJson('sessions.json', { ...snap, sessions: snap.sessions.filter(x => x.name !== b.name), pending: snap.pending.filter(x => x.name !== b.name) });
    return { ok: true };
  },
  // Phiên có trước lần khởi động lại máy (tmux trống) chờ khôi phục
  'GET /api/restore': () => pendingRestore(),
  async 'POST /api/restore'() {
    const done = [], failed = [];
    for (const x of await pendingRestore()) {
      try { await createSession(x); done.push(x.name); } catch (e) { failed.push(`${x.name}: ${e.message}`); }
    }
    const snap = await readSnap();
    await saveJson('sessions.json', { ...snap, pending: [] });
    await snapshot();
    return { done, failed };
  },
  async 'POST /api/restore/dismiss'() {
    const snap = await readSnap();
    await saveJson('sessions.json', { ...snap, pending: [] });
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
    const marks = await gitMarks(dir);
    for (const e of list) if (e && marks.has(e.name)) e.git = marks.get(e.name);
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
    await saveJson('notify.json', notifyPrefs);
    return notifyPrefs;
  },
  // Thao tác nhanh tự sửa: lưu trên máy chủ để mọi thiết bị dùng chung; null = dùng mặc định
  'GET /api/quick': () => fs.readFile(path.join(DATA, 'quick.json'), 'utf8').then(JSON.parse, () => null),
  async 'POST /api/quick'(_, b) {
    if (b.items === null) { await fs.rm(path.join(DATA, 'quick.json'), { force: true }); return null; }
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    if (!Array.isArray(b.items) || b.items.length > 30) throw fail(400, 'Danh sách không hợp lệ');
    const items = b.items.map(x => ({ emoji: str(x.emoji, 8), name: str(x.name, 40), desc: str(x.desc, 80), text: str(x.text, 2000), ask: !!x.ask }))
      .filter(x => x.name && x.text);
    await saveJson('quick.json', items);
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
    const f = s.agent && await transcriptFile(s.agent, s.dir, s.agentPid);
    const limit = Math.min(200, Math.max(10, Number(q.get('limit')) || 80));
    return { agent: s.agent, state: s.state, items: f ? chatItems(s.agent, await readTail(f, 4 * 1024 * 1024), limit) : [] };
  },
  // Trang Cài đặt
  async 'GET /api/info'() {
    const pkg = JSON.parse(await fs.readFile(path.join(PUBLIC, '..', 'package.json'), 'utf8').catch(() => '{}'));
    const claudeUsage = await fs.access(path.join(DATA, 'claude-statusline.mjs')).then(() => true, () => false);
    return { version: pkg.version || '?', roots: ROOTS, host: os.hostname(), platform: process.platform, claudeUsage, agents: await installedAgents() };
  },
  async 'POST /api/push/sub'(_, b) {
    let u;
    try { u = new URL(b.endpoint); } catch { throw fail(400, 'Endpoint không hợp lệ'); }
    if (u.protocol !== 'https:' || !PUSH_HOSTS.test(u.hostname)) throw fail(400, 'Dịch vụ push không được hỗ trợ');
    subs = [...subs.filter(s => s.endpoint !== b.endpoint), { endpoint: b.endpoint }];
    await saveJson('subs.json', subs);
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
  '/offline.html': ['offline.html', 'text/html'], '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'], '/icon-maskable.png': ['icon-maskable.png', 'image/png'],
  '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'],
};
// Font đóng gói sẵn: /fonts/<tên>.woff2 và /fonts/fonts.css
for (const f of await fs.readdir(path.join(PUBLIC, 'fonts')).catch(() => []))
  if (/^[a-z0-9-]+\.(woff2|css)$/.test(f)) STATIC['/fonts/' + f] = ['fonts/' + f, f.endsWith('.css') ? 'text/css' : 'font/woff2'];

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

// ---------- Ai được vào ----------
// tailscale serve gắn danh tính người gửi vào Tailscale-User-Login và ghi đè header giả mạo (đã thử).
// Chỉ chủ máy (hoặc TERMI_ALLOWED_USERS) được vào; thiết bị gắn tag, máy được chia sẻ và Funnel
// không có danh tính đó nên bị chặn. Gọi thẳng localhost trên chính máy này thì không qua serve.
let allowedCache = null;
async function allowedUsers() {
  if (process.env.TERMI_ALLOWED_USERS) return process.env.TERMI_ALLOWED_USERS.toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  if (!allowedCache) {
    try {
      const st = JSON.parse((await run(TAILSCALE, ['status', '--json'], { maxBuffer: 8e6, timeout: 5000 })).stdout);
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
  pipeUpgrade(req, socket, head, cb => net.connect(TTYD_PORT, '127.0.0.1', cb), req.url, req.headers.host);
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
  const st = req.method === 'GET' && STATIC[url.pathname];
  if (st) {
    const file = await fs.readFile(path.join(PUBLIC, st[0]));
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
  setInterval(() => snapshot().catch(e => console.error('snapshot', e.message)), 30_000);
  setInterval(() => ttydWatchdog().catch(e => console.error('watchdog', e.message)), 120_000);
  setTimeout(() => snapshot().catch(() => {}), 5000);
}
