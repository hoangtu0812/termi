import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { MAX_OUTPUT_CHARS, MAX_UPLOAD_BYTES } from '../config.mjs';
import { fail } from '../errors.mjs';
import { findFiles } from '../file-search.mjs';
import { gitMarks } from '../git/marks.mjs';
import { IMAGE_TYPES } from '../http/static.mjs';
import { rawResponse, streamingBody } from '../http/router.mjs';
import { clip } from '../text.mjs';

const HIDDEN = new Set(['.git', '.DS_Store']);
const MAX_UPLOAD_NAME = 80;
const IMAGE_HEADERS = { 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' };

const isListed = entry => !HIDDEN.has(entry.name) && !entry.name.startsWith('._');
const byKindThenName = (a, b) => b.dir - a.dir || a.name.localeCompare(b.name);

async function describeEntry(dir, entry) {
  const full = path.join(dir, entry.name);
  const stat = await fs.stat(full).catch(() => null);
  return stat && { name: entry.name, path: full, dir: stat.isDirectory(), size: stat.size, mtime: stat.mtimeMs };
}

async function readStart(file) {
  const handle = await fs.open(file);
  const buffer = Buffer.alloc(MAX_OUTPUT_CHARS + 1);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0).finally(() => handle.close());
  return buffer.subarray(0, bytesRead);
}

function uploadName(header) {
  const raw = decodeURIComponent(header || 'file');
  const name = path.basename(raw).replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-MAX_UPLOAD_NAME) || 'file';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}-${name}`;
}

async function saveUpload(req, dest) {
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) req.destroy(fail(413, 'File quá lớn (tối đa 25MB)'));
  });
  try {
    await pipeline(req, createWriteStream(dest, { flags: 'wx' }));
  } catch (error) {
    await fs.rm(dest, { force: true });
    throw error.status ? error : fail(400, 'Upload lỗi');
  }
}

export function fileRoutes({ paths, uploadDir }) {
  return {
    async 'GET /api/ls'(query) {
      const dir = await paths.need(query.get('dir'));
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const listed = await Promise.all(entries.filter(isListed).map(entry => describeEntry(dir, entry)));
      const marks = await gitMarks(dir);
      for (const entry of listed) if (entry && marks.has(entry.name)) entry.git = marks.get(entry.name);
      const parent = await paths.inside(path.dirname(dir)) && path.dirname(dir);
      return { dir, parent, entries: listed.filter(Boolean).sort(byKindThenName) };
    },

    async 'GET /api/find'(query) {
      const dir = await paths.need(query.get('dir'));
      return findFiles(dir, (query.get('q') || '').trim());
    },

    async 'GET /api/file'(query) {
      const file = await paths.need(query.get('path'), 'file');
      if (IMAGE_TYPES[path.extname(file).toLowerCase()]) return { path: file, image: true };
      const data = await readStart(file);
      if (data.includes(0)) return { path: file, binary: true };
      return { path: file, text: clip(data.toString('utf8')) };
    },

    async 'GET /api/raw'(query) {
      const file = await paths.need(query.get('path'), 'file');
      const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
      if (!type) throw fail(415, 'Chỉ xem trực tiếp được ảnh');
      return rawResponse({ 'content-type': type, ...IMAGE_HEADERS }, await fs.readFile(file));
    },

    'POST /api/upload': streamingBody(async (_, __, req) => {
      const dest = path.join(uploadDir, uploadName(req.headers['x-filename']));
      await saveUpload(req, dest);
      return { path: dest };
    }),
  };
}
