import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fail } from '../errors.mjs';

const QUICK_FILE = 'quick.json';
const PROJECT_QUICK_FILE = 'quick-projects.json';
const MAX_QUICK_PROJECTS = 100;
const MAX_QUICK_ITEMS = 30;
const QUICK_LIMITS = { emoji: 8, name: 40, desc: 80, text: 2000 };
const EDITOR_FILE = 'editor.json';
const MAX_EDITOR_URL = 300;
const EDITOR_PROTOCOLS = new Set(['https:', 'http:']);

const cut = (value, limit) => (typeof value === 'string' ? value.slice(0, limit) : '');

export function parseQuickItems(items) {
  if (!Array.isArray(items) || items.length > MAX_QUICK_ITEMS) throw fail(400, 'Danh sách không hợp lệ');
  return items.map(item => ({
    emoji: cut(item.emoji, QUICK_LIMITS.emoji),
    name: cut(item.name, QUICK_LIMITS.name),
    desc: cut(item.desc, QUICK_LIMITS.desc),
    text: cut(item.text, QUICK_LIMITS.text),
    ask: Boolean(item.ask),
  })).filter(item => item.name && item.text);
}

export function setProjectQuick(map, dir, items) {
  const next = { ...(map && typeof map === 'object' ? map : {}) };
  delete next[dir];
  if (items !== null) next[dir] = parseQuickItems(items);
  const dirs = Object.keys(next);
  for (const old of dirs.slice(0, Math.max(0, dirs.length - MAX_QUICK_PROJECTS))) delete next[old];
  return next;
}

export function parseEditorUrl(value) {
  if (value === null || value === '') return null;
  const url = typeof value === 'string' && value.length <= MAX_EDITOR_URL ? URL.parse(value) : null;
  if (!url || !EDITOR_PROTOCOLS.has(url.protocol)) throw fail(400, 'Địa chỉ VS Code web không hợp lệ');
  return url.href;
}

const exists = file => fs.access(file).then(() => true, () => false);

export function settingsRoutes({ store, agents, paths, config }) {
  return {
    async 'GET /api/info'() {
      const pkgFile = path.join(config.publicDir, '..', 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgFile, 'utf8').catch(() => '{}'));
      return {
        version: pkg.version || '?',
        roots: paths.roots,
        host: os.hostname(),
        platform: process.platform,
        claudeUsage: await exists(path.join(config.dataDir, 'claude-statusline.mjs')),
        agents: await agents.installed(),
        editorUrl: (await store.read(EDITOR_FILE))?.url ?? null,
      };
    },

    async 'POST /api/editor'(_, body) {
      const url = parseEditorUrl(body.url ?? null);
      if (url) await store.write(EDITOR_FILE, { url });
      else await store.remove(EDITOR_FILE);
      return { url };
    },

    'GET /api/quick': () => store.read(QUICK_FILE),

    async 'POST /api/quick'(_, body) {
      if (body.items === null) {
        await store.remove(QUICK_FILE);
        return null;
      }
      const items = parseQuickItems(body.items);
      await store.write(QUICK_FILE, items);
      return items;
    },

    async 'GET /api/quick/project'(query) {
      const dir = await paths.need(query.get('dir'));
      return (await store.read(PROJECT_QUICK_FILE))?.[dir] ?? null;
    },

    async 'POST /api/quick/project'(_, body) {
      const dir = await paths.need(body.dir);
      const map = await store.update(PROJECT_QUICK_FILE, current => setProjectQuick(current, dir, body.items ?? null));
      return map[dir] ?? null;
    },
  };
}
