import { chatItems, transcriptMessages } from '../agents/chat.mjs';
import { readTail } from '../agents/jsonl.mjs';
import { fail } from '../errors.mjs';
import { target, tmux } from '../tmux/client.mjs';
import { stepsToSubmit } from '../tmux/screen.mjs';
import { validKey, validName } from '../validate.mjs';

const TRANSCRIPT_TAIL_BYTES = 4 * 1024 * 1024;
const MAX_SEND_CHARS = 20_000;
const PASTE_BUFFER = 'termi';
const MENU_ATTEMPTS = 25;
const MENU_STEP_MS = 150;
const MESSAGE_SEPARATOR = '\n\n────────\n\n';

const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function requireSession(name) {
  if (!validName(name)) throw fail(400, 'Phiên không hợp lệ');
  return target(name);
}

function validSize(cols, rows) {
  const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  return inRange(cols, 10, 1000) && inRange(rows, 3, 500);
}

async function transcriptOf(agents, session) {
  const adapter = session.agent && agents.get(session.agent);
  const file = adapter && await adapter.transcriptFile(session.dir, session.agentPid);
  return file ? { adapter, lines: await readTail(file, TRANSCRIPT_TAIL_BYTES) } : null;
}

async function pasteText(pane, text) {
  if (text.length > MAX_SEND_CHARS) throw fail(413, 'Văn bản quá dài');
  const inCopyMode = (await tmux('display', '-p', '-t', pane, '#{pane_in_mode}')).stdout.trim() === '1';
  if (inCopyMode) await tmux('send-keys', '-t', pane, '-X', 'cancel');
  await tmux('set-buffer', '-b', PASTE_BUFFER, '--', text);
  await tmux('paste-buffer', '-p', '-d', '-b', PASTE_BUFFER, '-t', pane);
}

async function submitMenu(pane) {
  for (let attempt = 0; attempt < MENU_ATTEMPTS; attempt++) {
    const steps = stepsToSubmit((await tmux('capture-pane', '-p', '-J', '-t', pane)).stdout);
    if (steps === 0) return tmux('send-keys', '-t', pane, 'Enter');
    const keys = steps === null ? ['Down'] : Array(Math.abs(steps)).fill(steps > 0 ? 'Down' : 'Up');
    await tmux('send-keys', '-t', pane, ...keys);
    await sleep(MENU_STEP_MS);
  }
  throw fail(409, 'Không tìm thấy nút Submit trong menu');
}

async function send(_, body) {
  const pane = requireSession(body.session);
  if (body.key !== undefined) {
    if (!validKey(body.key)) throw fail(400, 'Phím không hỗ trợ');
    await tmux('send-keys', '-t', pane, body.key);
  }
  if (typeof body.text === 'string' && body.text) await pasteText(pane, body.text);
  if (body.enter) await tmux('send-keys', '-t', pane, 'Enter');
  return { ok: true };
}

async function resize(_, body) {
  const cols = Number(body.cols);
  const rows = Number(body.rows);
  if (!validName(body.session) || !validSize(cols, rows)) throw fail(400, 'Kích thước không hợp lệ');
  await tmux('resize-window', '-t', target(body.session), '-x', String(cols), '-y', String(rows)).catch(() => {});
  return { ok: true };
}

async function refresh(_, body) {
  const pane = requireSession(body.session);
  const clients = await tmux('list-clients', '-t', pane, '-F', '#{client_name}').catch(() => ({ stdout: '' }));
  for (const client of clients.stdout.split('\n').filter(Boolean)) {
    await tmux('refresh-client', '-t', client).catch(() => {});
  }
  return { ok: true };
}

function formatMessages(adapter, messages) {
  const speaker = message => (message.who === 'user' ? '▶ Bạn' : `◆ ${adapter.name}`);
  return messages.map(message => `${speaker(message)}\n${message.text}`).join(MESSAGE_SEPARATOR);
}

async function capture({ sessions, agents }, query) {
  const name = query.get('session');
  requireSession(name);
  const lines = clamp(query.get('lines'), 50, 5000, 1000);
  const transcript = await transcriptOf(agents, await sessions.find(name));
  const messages = transcript ? transcriptMessages(transcript.adapter, transcript.lines) : [];
  if (messages.length) return { text: formatMessages(transcript.adapter, messages) };
  const out = await tmux('capture-pane', '-p', '-J', '-S', `-${lines}`, '-t', target(name));
  return { text: out.stdout.replace(/\s+$/, '') };
}

async function chat({ sessions, agents }, query) {
  const session = await sessions.find(query.get('session'));
  const limit = clamp(query.get('limit'), 10, 200, 80);
  const transcript = await transcriptOf(agents, session);
  const items = transcript ? chatItems(transcript.adapter, transcript.lines, limit) : [];
  return { agent: session.agent, state: session.state, items };
}

export function terminalRoutes(context) {
  return {
    'POST /api/send': send,
    'POST /api/menu-submit': async (_, body) => {
      await submitMenu(requireSession(body.session));
      return { ok: true };
    },
    'POST /api/resize': resize,
    'POST /api/refresh': refresh,
    'GET /api/capture': query => capture(context, query),
    'GET /api/chat': query => chat(context, query),
  };
}
