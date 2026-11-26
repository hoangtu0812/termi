import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CHUNK_BYTES = 512 * 1024;
const INJECTED_PREFIXES = ['<', '# AGENTS.md'];

export async function readHead(file, bytes = DEFAULT_CHUNK_BYTES) {
  const handle = await fs.open(file);
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString().split('\n');
  } finally {
    await handle.close();
  }
}

export async function readTail(file, bytes = DEFAULT_CHUNK_BYTES) {
  const handle = await fs.open(file);
  try {
    const { size } = await handle.stat();
    const length = Math.min(bytes, size);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString().split('\n').reverse();
  } finally {
    await handle.close();
  }
}

export function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function lastJson(lines, pick) {
  for (const line of lines) {
    const record = parseJson(line);
    if (record === null) continue;
    const value = pick(record);
    if (value) return value;
  }
  return null;
}

const statOrNull = file => fs.stat(file).then(stat => ({ file, mtime: stat.mtimeMs }), () => null);

export async function newestFiles(dir, accept, limit) {
  const names = await fs.readdir(dir, { recursive: true }).catch(() => []);
  const stats = await Promise.all(names.filter(accept).map(name => statOrNull(path.join(dir, name))));
  return stats.filter(Boolean).sort((a, b) => b.mtime - a.mtime).slice(0, limit).map(entry => entry.file);
}

export const fileExists = file => fs.access(file).then(() => true, () => false);

export const readJsonFile = file => fs.readFile(file, 'utf8').then(JSON.parse, () => null);

export const isInjected = text => INJECTED_PREFIXES.some(prefix => text.startsWith(prefix));

export const isRealPrompt = text => typeof text === 'string' && Boolean(text.trim()) && !isInjected(text);

export function toMessage(who, text) {
  if (who !== 'user' && who !== 'assistant') return null;
  if (!text?.trim() || isInjected(text)) return null;
  return { who, text: text.trim() };
}
