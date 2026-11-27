import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_LOG_BYTES = 5 * 1024 * 1024;
const LOG_NAMES = ['termi.server.log', 'termi.ttyd.log'];

export function launchdLogFiles(platform, home) {
  if (platform !== 'darwin') return [];
  return LOG_NAMES.map(name => path.join(home, 'Library', 'Logs', name));
}

async function rotateOne(file, maxBytes, fsApi) {
  const stat = await fsApi.stat(file).catch(() => null);
  if (!stat || stat.size <= maxBytes) return false;
  await fsApi.copyFile(file, `${file}.1`);
  await fsApi.truncate(file, 0);
  return true;
}

export function createLogRotator({ files, maxBytes = MAX_LOG_BYTES, fsApi = fs }) {
  return async () => {
    const rotated = [];
    for (const file of files) if (await rotateOne(file, maxBytes, fsApi)) rotated.push(file);
    if (rotated.length) console.log(`log: rotated ${rotated.map(f => path.basename(f)).join(', ')}`);
    return rotated;
  };
}
