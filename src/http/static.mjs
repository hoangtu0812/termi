import fs from 'node:fs/promises';
import path from 'node:path';

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
const FONT_FILE = /^[a-z0-9-]+\.(woff2|css)$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';

export async function loadStaticFiles(publicDir) {
  const files = { ...STATIC_FILES };
  const fonts = await fs.readdir(path.join(publicDir, 'fonts')).catch(() => []);
  for (const font of fonts.filter(name => FONT_FILE.test(name))) {
    files[`/fonts/${font}`] = [`fonts/${font}`, font.endsWith('.css') ? 'text/css' : 'font/woff2'];
  }
  return files;
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

  const buildId = async () => String((await fs.stat(path.join(publicDir, 'index.html'))).mtimeMs);

  return { lookup, serve, buildId };
}
