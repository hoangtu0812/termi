import fs from 'node:fs/promises';
import path from 'node:path';
import { sharedResult } from '../shared-result.mjs';

export const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const STATIC_FILES = {
  '/': ['index.html', 'text/html'],
  '/manifest.json': ['manifest.json', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/sw.js': ['sw.js', 'text/javascript'],
  '/offline.html': ['offline.html', 'text/html'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
  '/icon-maskable.png': ['icon-maskable.png', 'image/png'],
  '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'],
};
const ASSET_DIRS = [
  { dir: 'fonts', pattern: /^[a-z0-9-]+\.(woff2|css)$/ },
  { dir: 'css', pattern: /^[a-z0-9-]+\.css$/ },
  { dir: 'js', pattern: /^[a-z0-9-]+\.m?js$/ },
];
const CONTENT_TYPES = {
  '.woff2': 'font/woff2',
  '.css': 'text/css',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
};
const IMMUTABLE = 'public, max-age=31536000, immutable';
const BUILD_CACHE_MS = 1000;

async function assetFiles(publicDir, { dir, pattern }) {
  const names = await fs.readdir(path.join(publicDir, dir)).catch(() => []);
  return names.filter(name => pattern.test(name)).map(name => `${dir}/${name}`);
}

export async function loadStaticFiles(publicDir) {
  const files = { ...STATIC_FILES };
  for (const assets of ASSET_DIRS) {
    for (const file of await assetFiles(publicDir, assets)) {
      files[`/${file}`] = [file, CONTENT_TYPES[path.extname(file)]];
    }
  }
  return files;
}

async function newestModification(publicDir, files) {
  const stats = await Promise.all(files.map(file => fs.stat(path.join(publicDir, file)).catch(() => null)));
  return String(Math.max(...stats.filter(Boolean).map(stat => stat.mtimeMs)));
}

export function createStaticServer(publicDir, files) {
  const lookup = (method, pathname) => (method === 'GET' && Object.hasOwn(files, pathname) ? files[pathname] : null);

  async function serve(res, [file, type]) {
    const content = await fs.readFile(path.join(publicDir, file));
    res.writeHead(200, {
      'content-type': type,
      'cache-control': file.endsWith('.woff2') ? IMMUTABLE : 'no-cache',
      'x-frame-options': 'SAMEORIGIN',
      'content-security-policy': "frame-ancestors 'self'",
      'referrer-policy': 'no-referrer',
    });
    res.end(content);
  }

  const uiFiles = [...new Set(Object.values(files).map(([file]) => file))];
  const build = sharedResult(() => newestModification(publicDir, uiFiles), { ttlMs: BUILD_CACHE_MS });

  return { lookup, serve, buildId: build.get };
}
