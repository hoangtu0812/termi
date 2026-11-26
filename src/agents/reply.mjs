import fs from 'node:fs/promises';
import { plainText } from '../text.mjs';
import { chatItems, transcriptMessages } from './chat.mjs';
import { lastJson, readTail } from './jsonl.mjs';

const FILE_CACHE_MS = 15_000;
const TAIL_BYTES = 1024 * 1024;
const RECENT_MESSAGES = 12;
const RECENT_ITEMS = 6;
const PREVIEW_CHARS = 300;

function summarize(adapter, lines, mtime) {
  const reply = transcriptMessages(adapter, lines, RECENT_MESSAGES).filter(m => m.who === 'assistant').pop();
  const items = chatItems(adapter, lines, RECENT_ITEMS);
  const last = items.at(-1);
  return {
    mtime,
    text: reply && plainText(reply.text).slice(0, PREVIEW_CHARS),
    model: lastJson(lines, adapter.model),
    lastTool: last?.kind === 'tools' ? last.steps.at(-1) : null,
    replyAt: items.filter(item => item.kind === 'msg' && item.who === 'assistant').at(-1)?.t || null,
  };
}

export function createReplyReader() {
  const fileCache = new Map();
  const replyCache = new Map();

  async function transcriptFor(adapter, cwd, pid) {
    const key = `${adapter.id}:${cwd}:${pid || ''}`;
    const cached = fileCache.get(key);
    if (cached && Date.now() - cached.t <= FILE_CACHE_MS) return cached.file;
    const file = await adapter.transcriptFile(cwd, pid);
    fileCache.set(key, { t: Date.now(), file });
    return file;
  }

  return async function lastReply(adapter, cwd, pid) {
    const file = await transcriptFor(adapter, cwd, pid);
    if (!file) return null;
    const mtime = (await fs.stat(file).catch(() => null))?.mtimeMs;
    const cached = replyCache.get(file);
    if (cached && cached.mtime === mtime) return cached;
    const reply = summarize(adapter, await readTail(file, TAIL_BYTES), mtime);
    replyCache.set(file, reply);
    return reply;
  };
}
