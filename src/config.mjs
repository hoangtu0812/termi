import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const MAX_OUTPUT_CHARS = 300_000;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const DEFAULT_PORT = 7680;
const DEFAULT_TTYD_PORT = 7681;
const DEFAULT_HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');

const splitList = (value, separator) => value.split(separator).map(item => item.trim()).filter(Boolean);

export function loadConfig(env = process.env, home = os.homedir()) {
  return {
    home,
    port: Number(env.TERMI_PORT) || DEFAULT_PORT,
    host: env.TERMI_HOST || DEFAULT_HOST,
    ttydPort: Number(env.TERMI_TTYD_PORT) || DEFAULT_TTYD_PORT,
    dataDir: env.TERMI_DATA ? path.resolve(env.TERMI_DATA) : path.join(home, '.termi'),
    roots: env.TERMI_ROOTS ? splitList(env.TERMI_ROOTS, ':') : [home],
    tailscale: env.TERMI_TAILSCALE || 'tailscale',
    allowedUsers: env.TERMI_ALLOWED_USERS ? splitList(env.TERMI_ALLOWED_USERS.toLowerCase(), ',') : null,
    publicDir: PUBLIC_DIR,
  };
}

export const resolveRoots = roots => Promise.all(roots.map(root => fs.realpath(root).catch(() => path.resolve(root))));
