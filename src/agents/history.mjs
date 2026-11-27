import fs from 'node:fs/promises';
import path from 'node:path';
import { validUuid } from '../validate.mjs';
import { parseJson, readHead } from './jsonl.mjs';

const SCAN_FOR_DIR = 300;
const SCAN_FOR_ID = 1000;
const MAX_FOR_DIR = 40;
const DEFAULT_LIMIT = 40;
const MAX_TITLE_CHARS = 160;
const UNTITLED = '(không tiêu đề)';

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

  return history;
}
