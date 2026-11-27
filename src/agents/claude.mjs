import path from 'node:path';
import { validUuid } from '../validate.mjs';
import {
  cachedJsonFile, fileExists, isRealPrompt, lastJson, newestFiles, readJsonFile, readTail, toMessage,
} from './jsonl.mjs';
import { binaryName } from './process.mjs';
import { toolSummary } from './tools.mjs';

const VERSIONED_INSTALL = '/.local/share/claude/versions/';
const MAX_TITLE_CHARS = 120;
const LIVE_USAGE_MAX_AGE_MS = 30 * 60_000;

const isConversationRecord = record =>
  (record.type === 'user' || record.type === 'assistant') && !record.isMeta && !record.isSidechain;

function contentParts(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

function firstText(content) {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.find(part => part.type === 'text')?.text : null;
}

function chatEvents(record) {
  if (!isConversationRecord(record)) return [];
  const events = [];
  for (const part of contentParts(record.message?.content)) {
    if (part.type === 'text' && part.text?.trim() && !part.text.startsWith('<')) {
      events.push({ who: record.type, text: part.text.trim() });
    } else if (part.type === 'tool_use' && record.type === 'assistant') {
      events.push({ tool: toolSummary(part.name, part.input) });
    }
  }
  return events;
}

function message(record) {
  if (!isConversationRecord(record)) return null;
  const parts = contentParts(record.message?.content);
  return toMessage(record.type, parts.filter(part => part.type === 'text').map(part => part.text).join('\n'));
}

function usageFromRecord(record) {
  const usage = record.type === 'assistant' && record.message?.usage;
  if (!usage) return null;
  const cached = (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  return { model: record.message.model, context: (usage.input_tokens || 0) + cached };
}

function parseHistory(record, entry) {
  entry.cwd ??= record.cwd;
  if (record.type === 'summary' && record.summary) entry.title = record.summary;
  if (record.type === 'custom-title' && record.customTitle) entry.custom = record.customTitle;
  const text = firstText(record.type === 'user' && !record.isMeta && record.message?.content);
  if (!entry.title && isRealPrompt(text)) entry.title = text;
}

function rateWindow(window, now) {
  return window && window.resets_at * 1000 > now && {
    pct: Math.round(window.used_percentage),
    resetsAt: window.resets_at * 1000,
  };
}

const MATCHES_HISTORY = name => name.split(path.sep).length === 2 && validUuid(path.basename(name, '.jsonl'));

const HISTORY_SPEC = {
  accept: MATCHES_HISTORY,
  start: file => ({ id: path.basename(file, '.jsonl') }),
  parse: parseHistory,
  isComplete: entry => Boolean(entry.id && entry.cwd && entry.title && entry.custom),
};

function createProcesses(claudeDir) {
  const processInfo = pid => (pid ? readJsonFile(path.join(claudeDir, 'sessions', `${pid}.json`)) : null);

  async function conversationId(pid) {
    const info = await processInfo(pid);
    return validUuid(info?.sessionId) ? info.sessionId : null;
  }

  async function conversation(pid) {
    const info = await processInfo(pid);
    if (!info) return null;
    const named = info.name && info.nameSource !== 'derived';
    return {
      id: validUuid(info.sessionId) ? info.sessionId : null,
      title: named ? String(info.name).slice(0, MAX_TITLE_CHARS) : null,
    };
  }

  return { conversationId, conversation };
}

function createTranscripts(projectsDir, conversationId) {
  const projectDir = cwd => path.join(projectsDir, cwd.replace(/[^A-Za-z0-9]/g, '-'));
  const topLevelJsonl = name => name.endsWith('.jsonl') && !name.includes(path.sep);

  return async function transcriptFile(cwd, pid) {
    const id = await conversationId(pid);
    if (id) {
      const file = path.join(projectDir(cwd), `${id}.jsonl`);
      if (await fileExists(file)) return file;
    }
    const [newest] = await newestFiles(projectDir(cwd), topLevelJsonl, 1);
    return newest || null;
  };
}

function createUsage(usageFile, conversationId, transcriptFile) {
  const readUsage = cachedJsonFile(usageFile);

  async function liveUsage(cwd, pid) {
    const sessions = (await readUsage())?.sessions || {};
    const id = await conversationId(pid);
    const live = (id && sessions[id]) || sessions[cwd];
    return live && Date.now() - live.at < LIVE_USAGE_MAX_AGE_MS ? live : null;
  }

  async function sessionTokens(cwd, pid) {
    const live = await liveUsage(cwd, pid);
    if (live) return { model: live.model, context: live.tokens, window: live.size, pct: live.pct };
    const file = await transcriptFile(cwd, pid);
    return file ? lastJson(await readTail(file), usageFromRecord) : null;
  }

  async function limits() {
    const rates = (await readUsage())?.rate_limits;
    if (!rates) return null;
    const now = Date.now();
    return { fiveHour: rateWindow(rates.five_hour, now), sevenDay: rateWindow(rates.seven_day, now), at: rates.at };
  }

  async function liveModel(id) {
    if (!id) return null;
    return (await readUsage())?.sessions?.[id]?.model || null;
  }

  return { sessionTokens, limits, liveModel };
}

export function createClaudeAgent({ home, dataDir }) {
  const claudeDir = path.join(home, '.claude');
  const projectsDir = path.join(claudeDir, 'projects');
  const { conversationId, conversation } = createProcesses(claudeDir);
  const transcriptFile = createTranscripts(projectsDir, conversationId);
  const usage = createUsage(path.join(dataDir, 'claude-usage.json'), conversationId, transcriptFile);

  return {
    id: 'claude',
    name: 'Claude',
    command: 'claude',
    matchProcess: exe => binaryName(exe) === 'claude' || exe.includes(VERSIONED_INSTALL),
    resumeCommand: id => `claude --resume ${id}`,
    conversation,
    transcriptFile,
    chatEvents,
    message,
    model: record => record.type === 'assistant' && record.message?.model,
    ...usage,
    resumeId: session => conversationId(session.agentPid),
    history: { dir: projectsDir, ...HISTORY_SPEC },
  };
}
