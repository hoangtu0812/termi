import fs from 'node:fs/promises';
import path from 'node:path';
import { validUuid } from '../validate.mjs';
import { parseJson, readHead, readTail } from './jsonl.mjs';

const SCAN_FOR_DIR = 300;
const SCAN_FOR_ID = 1000;
const MAX_FOR_DIR = 40;
const DEFAULT_LIMIT = 40;
const MAX_TITLE_CHARS = 160;
const UNTITLED = '(không tiêu đề)';
const SCAN_FOR_SEARCH = 200;
const MAX_SEARCH_RESULTS = 30;
const SEARCH_TAIL_BYTES = 2 * 1024 * 1024;
const SNIPPET_BEFORE = 50;
const SNIPPET_CHARS = 160;

export const foldText = text => text.normalize('NFC').toLocaleLowerCase();

export function snippetAround(text, needle) {
  const flat = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  const at = flat.toLocaleLowerCase().indexOf(needle);
  if (at < 0) return null;
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = start + SNIPPET_CHARS;
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}

async function contentMatch(adapter, file, needle) {
  for (const line of await readTail(file, SEARCH_TAIL_BYTES)) {
    if (!foldText(line).includes(needle)) continue;
    const record = parseJson(line);
    const message = record && adapter.message(record);
    const snippet = message && snippetAround(message.text, needle);
    if (snippet) return snippet;
  }
  return null;
}

async function conversationFiles(agents) {
  const files = [];
  for (const agent of agents.list.filter(a => a.history)) {
    const { dir, accept } = agent.history;
    const names = await fs.readdir(dir, { recursive: true }).catch(() => []);
    const accepted = names.filter(name => name.endsWith('.jsonl') && accept(name));
    files.push(...accepted.map(name => ({ agent, file: path.join(dir, name) })));
  }
  const stats = await Promise.all(files.map(entry => fs.stat(entry.file).then(
    stat => ({ ...entry, mtime: stat.mtimeMs }),
    () => null,
  )));
  return stats.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
}

async function readConversation(agent, file, mtime) {
  const spec = agent.history;
  const entry = spec.start(file);
  for (const line of await readHead(file)) {
    const record = parseJson(line);
    if (record === null) continue;
    spec.parse(record, entry);
    if (spec.isComplete(entry)) break;
  }
  if (!validUuid(entry.id) || !entry.cwd) return null;
  const title = (entry.custom || entry.title || UNTITLED).trim().slice(0, MAX_TITLE_CHARS);
  return { agent: agent.id, id: entry.id, cwd: entry.cwd, title, mtime };
}

export function createHistory(agents) {
  const cache = new Map();

  async function cachedConversation({ agent, file, mtime }) {
    const cached = cache.get(file);
    if (cached && cached.mtime === mtime) return cached.entry;
    const entry = await readConversation(agent, file, mtime);
    cache.set(file, { mtime, entry });
    return entry;
  }

  async function history(dir, limit = DEFAULT_LIMIT) {
    const recent = (await conversationFiles(agents)).slice(0, dir ? SCAN_FOR_DIR : limit);
    const entries = await Promise.all(recent.map(cachedConversation));
    return entries.filter(entry => entry && (!dir || entry.cwd === dir)).slice(0, dir ? MAX_FOR_DIR : limit);
  }

  history.find = async id => {
    for (const file of (await conversationFiles(agents)).slice(0, SCAN_FOR_ID)) {
      const conversation = await cachedConversation(file);
      if (conversation?.id === id) return { adapter: file.agent, file: file.file, conversation };
    }
    return null;
  };

  history.search = async (query, dir) => {
    const needle = foldText(query);
    const found = [];
    for (const file of (await conversationFiles(agents)).slice(0, SCAN_FOR_SEARCH)) {
      const conversation = await cachedConversation(file);
      if (!conversation || (dir && conversation.cwd !== dir)) continue;
      const snippet = await contentMatch(file.agent, file.file, needle).catch(() => null);
      if (snippet || foldText(conversation.title).includes(needle)) found.push({ ...conversation, snippet });
      if (found.length >= MAX_SEARCH_RESULTS) break;
    }
    return found;
  };

  return history;
}
