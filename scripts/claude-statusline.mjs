#!/usr/bin/env node
// Statusline cho Claude Code: lưu hạn mức gói (rate_limits) và mức đầy ngữ cảnh của từng thư mục vào
// ~/.termi/claude-usage.json để termi hiển thị, rồi chuyển nguyên dữ liệu cho statusline cũ của bạn (nếu có).
// Đây là đường chính thức duy nhất để biết hạn mức 5 giờ / tuần (https://code.claude.com/docs/en/statusline).
//
//   node scripts/claude-statusline.mjs install     cài vào ~/.claude/settings.json (giữ statusline cũ)
//   node scripts/claude-statusline.mjs uninstall   trả lại statusline cũ
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DIR = path.join(os.homedir(), '.termi');
const OUT = path.join(DIR, 'claude-usage.json');
const NEXT = path.join(DIR, 'statusline-next.json'); // statusline cũ của người dùng
const SELF = path.join(DIR, 'claude-statusline.mjs'); // bản chép: không phụ thuộc ổ chứa mã nguồn
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const writeAtomic = (file, text) => { const tmp = `${file}.${process.pid}`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); };

const cmd = process.argv[2];
if (cmd === 'install' || cmd === 'uninstall') {
  fs.mkdirSync(DIR, { recursive: true });
  const settings = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : {};
  const ours = settings.statusLine?.command?.includes('claude-statusline.mjs');
  if (cmd === 'install') {
    fs.copyFileSync(import.meta.filename, SELF);
    if (!ours) {
      if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, `${SETTINGS}.termi-backup`);
      writeAtomic(NEXT, JSON.stringify(settings.statusLine ?? null));
      // Đường dẫn node ổn định: bản trong Cellar của Homebrew đổi tên mỗi lần nâng cấp
      const node = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'].find(f => fs.existsSync(f)) || process.execPath;
      settings.statusLine = { ...settings.statusLine, type: 'command', command: `"${node}" "${SELF}"` };
      writeAtomic(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
    }
    console.log(ours ? 'Đã cập nhật script statusline của termi.' : 'Đã cài statusline của termi (statusline cũ vẫn được hiển thị).');
  } else {
    if (ours) {
      const prev = fs.existsSync(NEXT) ? JSON.parse(fs.readFileSync(NEXT, 'utf8')) : null;
      if (prev) settings.statusLine = prev; else delete settings.statusLine;
      writeAtomic(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
    }
    fs.rmSync(NEXT, { force: true });
    console.log('Đã trả lại statusline cũ.');
  }
  process.exit(0);
}

// Chạy như statusline: stdin là JSON của Claude Code
const input = fs.readFileSync(0, 'utf8');
try {
  const j = JSON.parse(input);
  let data = {};
  try { data = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {}
  const now = Date.now();
  if (j.rate_limits) data.rate_limits = { ...j.rate_limits, at: now };
  const cwd = j.workspace?.current_dir || j.cwd;
  if (cwd && j.context_window) {
    const c = j.context_window;
    data.sessions = Object.fromEntries(Object.entries(data.sessions || {}).filter(([, v]) => now - v.at < 7 * 864e5)); // bỏ mục > 7 ngày
    const entry = { pct: c.used_percentage, size: c.context_window_size, tokens: c.total_input_tokens, model: j.model?.display_name || j.model?.id, at: now };
    data.sessions[cwd] = entry;
    if (j.session_id) data.sessions[j.session_id] = entry; // nhiều phiên cùng thư mục: termi tra theo mã hội thoại
  }
  fs.mkdirSync(DIR, { recursive: true });
  writeAtomic(OUT, JSON.stringify(data));
} catch {} // statusline không bao giờ được làm hỏng giao diện Claude Code

let next = null;
try { next = JSON.parse(fs.readFileSync(NEXT, 'utf8')); } catch {}
if (next?.command) {
  const r = spawnSync('/bin/sh', ['-c', next.command], { input, encoding: 'utf8', timeout: 5000 });
  process.stdout.write(r.stdout || '');
}
