import fs from 'node:fs/promises';
import path from 'node:path';

const SESSION_NAME = /^[A-Za-z0-9_-]{1,40}$/;
const COMMIT_HASH = /^[0-9a-f]{4,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
const LOCAL_OR_TAILNET_HOST = /^(localhost|127\.0\.0\.1|[a-z0-9-]+\.[a-z0-9-]+\.ts\.net)(:\d+)?$/i;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_GIT_PATH_LENGTH = 4096;
const NAMED_KEYS = [
  'Escape', 'C-c', 'C-d', 'Tab', 'BTab', 'Up', 'Down', 'Left', 'Right', 'Enter', 'PageUp', 'PageDown',
];
const MENU_NUMBER_KEYS = [...'123456789'];
const ALLOWED_KEYS = new Set([...NAMED_KEYS, ...MENU_NUMBER_KEYS]);

const matches = pattern => value => typeof value === 'string' && pattern.test(value);

export const validName = matches(SESSION_NAME);
export const validRev = matches(COMMIT_HASH);
export const validUuid = matches(UUID);
export const validHost = matches(LOCAL_OR_TAILNET_HOST);
export const validTime = matches(CLOCK_TIME);
export const validKey = key => ALLOWED_KEYS.has(key);

export function validBranch(value) {
  return matches(BRANCH)(value) && !value.startsWith('-') && !value.includes('..');
}

export function validGitPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length < MAX_GIT_PATH_LENGTH && !value.includes('\0');
}

const isInside = (real, roots) => roots.some(root => real === root || real.startsWith(root + path.sep));

export async function safePath(candidate, kind, roots) {
  if (typeof candidate !== 'string' || !candidate) return null;
  try {
    const real = await fs.realpath(candidate);
    const stat = await fs.stat(real);
    const rightKind = kind === 'dir' ? stat.isDirectory() : stat.isFile();
    return rightKind && isInside(real, roots) ? real : null;
  } catch {
    return null;
  }
}

export const safeDir = (candidate, roots) => safePath(candidate, 'dir', roots);
