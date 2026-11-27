import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fail } from '../errors.mjs';

const QUICK_FILE = 'quick.json';
const MAX_QUICK_ITEMS = 30;
const QUICK_LIMITS = { emoji: 8, name: 40, desc: 80, text: 2000 };

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
      };
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
  };
}
