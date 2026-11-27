#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const NEXT_TIMEOUT_MS = 5000;
const STABLE_NODES = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'];

const cmd = process.argv[2];
const isSetup = cmd === 'install' || cmd === 'uninstall';
const DATA_DIR = process.env.TERMI_DATA ? path.resolve(process.env.TERMI_DATA) : path.join(os.homedir(), '.termi');
const DIR = isSetup ? DATA_DIR : import.meta.dirname;
const OUT = path.join(DIR, 'claude-usage.json');
const NEXT = path.join(DIR, 'statusline-next.json');
const SELF = path.join(DIR, 'claude-statusline.mjs');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const writeSettings = settings => writeAtomic(SETTINGS, JSON.stringify(settings, null, 2) + '\n');

function install(settings, ours) {
  fs.copyFileSync(import.meta.filename, SELF);
  if (!ours) {
    if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, `${SETTINGS}.termi-backup`);
    writeAtomic(NEXT, JSON.stringify(settings.statusLine ?? null));
    const node = STABLE_NODES.find(file => fs.existsSync(file)) || process.execPath;
    settings.statusLine = { ...settings.statusLine, type: 'command', command: `"${node}" "${SELF}"` };
    writeSettings(settings);
  }
  const UPDATED = 'Đã cập nhật script statusline của termi.';
  const INSTALLED = 'Đã cài statusline của termi (statusline cũ vẫn được hiển thị).';
  console.log(ours ? UPDATED : INSTALLED);
}

function uninstall(settings, ours) {
  if (ours) {
    const previous = readJson(NEXT, null);
    if (previous) settings.statusLine = previous;
    else delete settings.statusLine;
    writeSettings(settings);
  }
  fs.rmSync(NEXT, { force: true });
  console.log('Đã trả lại statusline cũ.');
}

function setup() {
  fs.mkdirSync(DIR, { recursive: true });
  const settings = readJson(SETTINGS, {});
  const ours = settings.statusLine?.command?.includes('claude-statusline.mjs');
  if (cmd === 'install') install(settings, ours);
  else uninstall(settings, ours);
}

function readSaved() {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return {};
  }
}

function contextEntry(status, now) {
  const window = status.context_window;
  return {
    pct: window.used_percentage,
    size: window.context_window_size,
    tokens: window.total_input_tokens,
    model: status.model?.display_name || status.model?.id,
    at: now,
  };
}

function record(input) {
  const status = JSON.parse(input);
  const data = readSaved();
  const now = Date.now();
  if (status.rate_limits) data.rate_limits = { ...status.rate_limits, at: now };
  const cwd = status.workspace?.current_dir || status.cwd;
  if (cwd && status.context_window) {
    const fresh = Object.entries(data.sessions || {}).filter(([, entry]) => now - entry.at < STALE_MS);
    data.sessions = Object.fromEntries(fresh);
    const entry = contextEntry(status, now);
    data.sessions[cwd] = entry;
    if (status.session_id) data.sessions[status.session_id] = entry;
  }
  fs.mkdirSync(DIR, { recursive: true });
  writeAtomic(OUT, JSON.stringify(data));
}

function forward(input) {
  let next = null;
  try {
    next = JSON.parse(fs.readFileSync(NEXT, 'utf8'));
  } catch {
    next = null;
  }
  if (!next?.command) return;
  const result = spawnSync('/bin/sh', ['-c', next.command], { input, encoding: 'utf8', timeout: NEXT_TIMEOUT_MS });
  process.stdout.write(result.stdout || '');
}

function recordSafely(input) {
  try {
    record(input);
    return true;
  } catch {
    return false;
  }
}

function runAsStatusline() {
  const input = fs.readFileSync(0, 'utf8');
  recordSafely(input);
  forward(input);
}

if (isSetup) {
  setup();
  process.exit(0);
}
runAsStatusline();
