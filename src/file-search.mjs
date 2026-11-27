import fs from 'node:fs/promises';
import path from 'node:path';
import { git } from './git/run.mjs';

export const MAX_RESULTS = 60;
const MAX_WALK_ENTRIES = 20_000;
const SKIPPED_DIRS = new Set(['node_modules']);

const baseName = file => file.slice(file.lastIndexOf('/') + 1).toLowerCase();
const isHidden = name => name.startsWith('.');

export function rankMatches(files, term, limit = MAX_RESULTS) {
  const wanted = term.toLowerCase();
  const nameHit = file => baseName(file).includes(wanted);
  return files
    .filter(file => file.toLowerCase().includes(wanted) && !baseName(file).startsWith('._'))
    .sort((a, b) => nameHit(b) - nameHit(a) || a.length - b.length)
    .slice(0, limit);
}

async function trackedFiles(dir) {
  const out = await git(dir, 'ls-files', '-co', '--exclude-standard').catch(() => '');
  return out.split('\n').filter(Boolean);
}

export async function walkFiles(dir, readdir = fs.readdir) {
  const files = [];
  const queue = [''];
  let seen = 0;
  while (queue.length && seen < MAX_WALK_ENTRIES) {
    const rel = queue.shift();
    const entries = await readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      seen++;
      if (isHidden(entry.name) || SKIPPED_DIRS.has(entry.name)) continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) queue.push(child);
      else files.push(child);
    }
  }
  return files;
}

export async function findFiles(dir, term) {
  if (!term) return [];
  const tracked = await trackedFiles(dir);
  const files = tracked.length ? tracked : await walkFiles(dir);
  return rankMatches(files, term).map(rel => ({ rel, path: path.join(dir, rel) }));
}
