import path from 'node:path';
import { validUuid } from '../validate.mjs';
import {
  isInjected, isRealPrompt, lastJson, newestFiles, readHead, readTail, toMessage,
} from './jsonl.mjs';
import { binaryName } from './process.mjs';
import { toolSummary } from './tools.mjs';

const RECENT_FILES = 30;
const META_BYTES = 64 * 1024;
const TOOL_CALLS = new Set(['function_call', 'custom_tool_call']);
const TEXT_PARTS = new Set(['input_text', 'output_text']);

const isRollout = name => path.basename(name).startsWith('rollout-');

const messageText = payload =>
  (payload.content || []).filter(part => TEXT_PARTS.has(part.type)).map(part => part.text).join('\n');

function chatEvents(record) {
  if (record.type !== 'response_item') return [];
  const payload = record.payload || {};
  if (payload.type === 'message' && (payload.role === 'user' || payload.role === 'assistant')) {
    const text = messageText(payload).trim();
    return text && !isInjected(text) ? [{ who: payload.role, text }] : [];
  }
  if (TOOL_CALLS.has(payload.type)) return [{ tool: toolSummary(payload.name, payload.arguments ?? payload.input) }];
  return [];
}

function message(record) {
  if (record.type !== 'response_item' || record.payload?.type !== 'message') return null;
  return toMessage(record.payload.role, messageText(record.payload));
}

function userPrompt(record, payload) {
  if (record.type === 'response_item' && payload.role === 'user') {
    return payload.content?.find(part => part.type === 'input_text')?.text;
  }
  if (record.type === 'event_msg' && payload.type === 'user_message') return payload.message;
  return null;
}

function parseHistory(record, entry) {
  const payload = record.payload || {};
  if (record.type === 'session_meta') {
    entry.id = payload.id;
    entry.cwd = payload.cwd;
  }
  const text = userPrompt(record, payload);
  if (!entry.title && isRealPrompt(text)) entry.title = text;
}

function tokenUsage(record) {
  const info = record.payload?.type === 'token_count' && record.payload.info;
  return info && {
    context: info.last_token_usage?.total_tokens,
    window: info.model_context_window,
    total: info.total_token_usage?.total_tokens,
  };
}

const percentWindow = window => window && {
  pct: Math.round(window.used_percent),
  minutes: window.window_minutes,
  resetsAt: window.resets_at * 1000,
};

export function createCodexAgent({ home }) {
  const sessionsDir = path.join(home, '.codex', 'sessions');
  const recentFiles = () => newestFiles(sessionsDir, name => isRollout(name) && name.endsWith('.jsonl'), RECENT_FILES);

  async function sessionMeta(file) {
    const lines = (await readHead(file, META_BYTES)).reverse();
    return lastJson(lines, record => record.type === 'session_meta' && record.payload);
  }

  async function transcriptFile(cwd) {
    for (const file of await recentFiles()) {
      if ((await sessionMeta(file))?.cwd === cwd) return file;
    }
    return null;
  }

  async function sessionTokens(cwd) {
    const file = await transcriptFile(cwd);
    return file ? lastJson(await readTail(file), tokenUsage) : null;
  }

  async function limits() {
    for (const file of await recentFiles()) {
      const rates = lastJson(await readTail(file), r => r.payload?.type === 'token_count' && r.payload.rate_limits);
      if (!rates) continue;
      const { plan_type: plan, primary, secondary } = rates;
      return { plan, primary: percentWindow(primary), secondary: percentWindow(secondary) };
    }
    return null;
  }

  async function resumeId(session) {
    const file = await transcriptFile(session.dir);
    const meta = file && await sessionMeta(file);
    return validUuid(meta?.id) ? meta.id : null;
  }

  return {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    matchProcess: exe => binaryName(exe) === 'codex',
    resumeCommand: id => `codex resume ${id}`,
    transcriptFile,
    chatEvents,
    message,
    model: record => record.type === 'turn_context' && record.payload?.model,
    sessionTokens,
    limits,
    resumeId,
    history: {
      dir: sessionsDir,
      accept: isRollout,
      start: () => ({ id: null }),
      parse: parseHistory,
      isComplete: entry => Boolean(entry.id && entry.cwd && entry.title),
    },
  };
}
