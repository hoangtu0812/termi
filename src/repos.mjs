import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_MS = 60_000;
const MAX_DEPTH = 4;
const SKIPPED_DIRS = new Set(['node_modules', 'Library', 'Applications', 'Pictures', 'Music', 'Movies', 'Downloads']);

const isSearchable = entry => entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_DIRS.has(entry.name);

async function findRepos(dir, depth, found) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) return;
  if (entries.some(entry => entry.name === '.git')) {
    found.push(dir);
    return;
  }
  if (depth === 0) return;
  const children = entries.filter(isSearchable).map(entry => path.join(dir, entry.name));
  await Promise.all(children.map(child => findRepos(child, depth - 1, found)));
}

export function createRepoFinder(roots, now = Date.now) {
  let cache = { at: -Infinity, list: [] };

  return async function repos() {
    if (now() - cache.at < CACHE_MS) return cache.list;
    const found = [];
    await Promise.all(roots.map(root => findRepos(root, MAX_DEPTH, found)));
    cache = { at: now(), list: found.sort() };
    return cache.list;
  };
}
