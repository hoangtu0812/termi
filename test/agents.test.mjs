import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chatItems, transcriptMessages } from '../src/agents/chat.mjs';
import { createHistory } from '../src/agents/history.mjs';
import { createAgents } from '../src/agents/index.mjs';
import { readTail } from '../src/agents/jsonl.mjs';
import { executableOf } from '../src/agents/process.mjs';
import { createReplyReader } from '../src/agents/reply.mjs';
import { toolSummary } from '../src/agents/tools.mjs';

const FIXTURE_HOME = path.join(import.meta.dirname, 'fixtures', 'home');
const CLAUDE_FIRST = '11111111-1111-4111-8111-111111111111';
const CLAUDE_SECOND = '22222222-2222-4222-8222-222222222222';
const CODEX_API = '33333333-3333-4333-8333-333333333333';
const CODEX_WEB = '44444444-4444-4444-8444-444444444444';
const CLAUDE_PROJECT = '.claude/projects/-work-app';
const CODEX_API_FILE = `.codex/sessions/2026/11/26/rollout-2026-11-26T10-00-00-${CODEX_API}.jsonl`;
const CODEX_WEB_FILE = `.codex/sessions/2026/11/25/rollout-2026-11-25T09-00-00-${CODEX_WEB}.jsonl`;
const HOUR_S = 3600;

const jsonLines = records => records.map(record => JSON.stringify(record)).reverse();

async function setMtime(file, minutesAgo) {
  const time = new Date(Date.now() - minutesAgo * 60_000);
  await fs.utimes(file, time, time);
}

async function fixture(t, usage = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'termi-agents-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const dataDir = path.join(root, 'data');
  await fs.cp(FIXTURE_HOME, home, { recursive: true });
  await fs.mkdir(dataDir);
  await fs.writeFile(path.join(dataDir, 'claude-usage.json'), JSON.stringify(usage));
  await setMtime(path.join(home, CLAUDE_PROJECT, `${CLAUDE_FIRST}.jsonl`), 10);
  await setMtime(path.join(home, CODEX_API_FILE), 15);
  await setMtime(path.join(home, CLAUDE_PROJECT, `${CLAUDE_SECOND}.jsonl`), 20);
  await setMtime(path.join(home, CODEX_WEB_FILE), 30);
  await setMtime(path.join(home, CLAUDE_PROJECT, 'not-a-uuid.jsonl'), 60);
  await setMtime(path.join(home, CLAUDE_PROJECT, CLAUDE_FIRST, 'subagents', 'agent-1.jsonl'), 60);
  return { home, dataDir, agents: createAgents({ home, dataDir }) };
}

test('agent processes are detected from the command line', () => {
  const agents = createAgents({ home: '/h', dataDir: '/d' });
  const detect = line => agents.detect(executableOf(line));
  assert.equal(detect('/Users/a/.local/share/claude/versions/2.1.332'), 'claude');
  assert.equal(detect('/Users/a/.local/bin/claude --resume x'), 'claude');
  assert.equal(detect('/Users/a/.local/bin/codex'), 'codex');
  assert.equal(detect('node /usr/lib/node_modules/@openai/codex/bin/codex.js'), 'codex');
  assert.equal(detect('/opt/homebrew/bin/agy'), 'agy');
  assert.equal(detect('/Applications/Claude.app/Contents/MacOS/Claude'), null);
  assert.equal(detect('/bin/zsh'), null);
  assert.equal(detect('node'), null);
});

test('registry lookups', () => {
  const agents = createAgents({ home: '/h', dataDir: '/d' });
  assert.deepEqual(agents.list.map(a => a.id), ['claude', 'codex', 'agy']);
  assert.equal(agents.nameOf('codex'), 'Codex');
  assert.equal(agents.nameOf(undefined), 'Agent');
  assert.ok(!agents.has('constructor'));
  assert.equal(agents.get('agy').resumeCommand, null);
  assert.equal(agents.get('claude').resumeCommand(CLAUDE_FIRST), `claude --resume ${CLAUDE_FIRST}`);
  assert.equal(agents.get('codex').resumeCommand(CODEX_API), `codex resume ${CODEX_API}`);
});

test('tool calls are summarized for the chat view', () => {
  assert.deepEqual(toolSummary('Edit', { file_path: '/x/y/index.html' }), { verb: 'Sửa', detail: 'index.html' });
  const bash = toolSummary('Bash', { command: 'npm test', description: 'Chạy test' });
  assert.deepEqual(bash, { verb: 'Chạy', detail: 'Chạy test' });
  const codexExec = toolSummary('exec', 'const r = await tools.exec_command({cmd:"rg -n TODO src"})');
  assert.deepEqual(codexExec, { verb: 'Chạy', detail: 'rg -n TODO src' });
  assert.deepEqual(toolSummary('shell', '{"command":["bash","-lc","ls"]}'), { verb: 'Chạy', detail: 'bash -lc ls' });
  assert.deepEqual(toolSummary('constructor', {}), { verb: 'constructor', detail: '' });
  assert.deepEqual(toolSummary('mcp__x', 'null'), { verb: 'mcp__x', detail: '' });
  assert.equal(toolSummary('Bash', { command: 'x'.repeat(500) }).detail.length, 140);
});

test('Claude chat: messages and grouped tool steps', () => {
  const claude = createAgents({ home: '/h', dataDir: '/d' }).get('claude');
  const lines = jsonLines([
    { type: 'user', message: { content: 'chạy test giúp tôi' }, timestamp: '2026-11-26T10:00:00Z' },
    { type: 'assistant', message: { content: [
      { type: 'text', text: 'Để tôi chạy.' },
      { type: 'tool_use', name: 'Bash', input: { command: 'npm test', description: 'Chạy test' } },
    ] } },
    { type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Read', input: { file_path: '/a/b/server.mjs' } },
    ] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '22 test qua.' }] } },
  ]);
  const describe = item => (item.kind === 'tools'
    ? item.steps.map(step => `${step.verb} ${step.detail}`)
    : `${item.who}: ${item.text}`);
  assert.deepEqual(chatItems(claude, lines).map(describe), [
    'user: chạy test giúp tôi',
    'assistant: Để tôi chạy.',
    ['Chạy Chạy test', 'Đọc server.mjs'],
    'assistant: 22 test qua.',
  ]);
  assert.equal(chatItems(claude, lines)[0].t, Date.parse('2026-11-26T10:00:00Z'));
});

test('transcript messages skip meta, tool results and injected text', () => {
  const agents = createAgents({ home: '/h', dataDir: '/d' });
  const claude = jsonLines([
    { type: 'user', message: { content: 'sửa lỗi đăng nhập' } },
    { type: 'user', isMeta: true, message: { content: 'meta' } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } },
    { type: 'assistant', message: { content: [
      { type: 'thinking', thinking: 'x' },
      { type: 'text', text: 'Đã sửa.' },
    ] } },
  ]);
  assert.deepEqual(transcriptMessages(agents.get('claude'), claude), [
    { who: 'user', text: 'sửa lỗi đăng nhập', t: null },
    { who: 'assistant', text: 'Đã sửa.', t: null },
  ]);
  const message = (role, type, text) => ({
    type: 'response_item',
    payload: { type: 'message', role, content: [{ type, text }] },
  });
  const codex = jsonLines([
    message('user', 'input_text', '# AGENTS.md ...'),
    message('user', 'input_text', 'chạy test'),
    message('assistant', 'output_text', '12 test qua'),
  ]);
  assert.deepEqual(transcriptMessages(agents.get('codex'), codex), [
    { who: 'user', text: 'chạy test', t: null },
    { who: 'assistant', text: '12 test qua', t: null },
  ]);
  assert.deepEqual(transcriptMessages(agents.get('agy'), codex), []);
});

test('conversation history from both agents, newest first', async t => {
  const { agents } = await fixture(t);
  const history = createHistory(agents);
  const all = await history();
  assert.deepEqual(all.map(h => [h.agent, h.id, h.cwd, h.title]), [
    ['claude', CLAUDE_FIRST, '/work/app', 'Sửa đăng nhập'],
    ['codex', CODEX_API, '/work/api', 'chạy test api'],
    ['claude', CLAUDE_SECOND, '/work/app', 'Tóm tắt cũ'],
    ['codex', CODEX_WEB, '/work/web', 'thêm dark mode'],
  ]);
  assert.deepEqual((await history('/work/app')).map(h => h.id), [CLAUDE_FIRST, CLAUDE_SECOND]);
  assert.deepEqual((await history(undefined, 1)).map(h => h.id), [CLAUDE_FIRST]);
  assert.deepEqual(await history('/nowhere'), []);
});

test('Claude conversation, transcript and resume id from the process id', async t => {
  const { home, agents } = await fixture(t);
  const claude = agents.get('claude');
  assert.deepEqual(await claude.conversation('4242'), { id: CLAUDE_FIRST, title: 'Sửa đăng nhập' });
  assert.deepEqual(await claude.conversation('4343'), { id: CLAUDE_SECOND, title: null });
  assert.deepEqual(await claude.conversation('4444'), { id: null, title: null });
  assert.equal(await claude.conversation('9999'), null);
  const file = id => path.join(home, CLAUDE_PROJECT, `${id}.jsonl`);
  assert.equal(await claude.transcriptFile('/work/app', '4343'), file(CLAUDE_SECOND));
  assert.equal(await claude.transcriptFile('/work/app', undefined), file(CLAUDE_FIRST));
  assert.equal(await claude.transcriptFile('/nowhere', undefined), null);
  assert.equal(await claude.resumeId({ agentPid: '4242' }), CLAUDE_FIRST);
  assert.equal(await claude.resumeId({ agentPid: '4444' }), null);
});

test('Codex transcript and resume id from the working folder', async t => {
  const { home, agents } = await fixture(t);
  const codex = agents.get('codex');
  assert.equal(await codex.transcriptFile('/work/api'), path.join(home, CODEX_API_FILE));
  assert.equal(await codex.transcriptFile('/nowhere'), null);
  assert.equal(await codex.resumeId({ dir: '/work/web' }), CODEX_WEB);
  assert.equal(await agents.get('agy').resumeId({ dir: '/work/api' }), null);
});

test('latest reply preview, model, current step and reply time', async t => {
  const { agents } = await fixture(t);
  const lastReply = createReplyReader();
  const claude = await lastReply(agents.get('claude'), '/work/app', '4242');
  assert.equal(claude.text, 'Xong Đã sửa login.js. Test qua hết.');
  assert.equal(claude.model, 'claude-opus-5-5');
  assert.deepEqual(claude.lastTool, { verb: 'mcp__x__y', detail: 'z' });
  assert.equal(claude.replyAt, Date.parse('2026-11-26T10:06:00Z'));
  const codex = await lastReply(agents.get('codex'), '/work/api');
  assert.equal(codex.text, '12 test qua hết lỗi');
  assert.equal(codex.model, 'gpt-5-codex');
  assert.equal(codex.lastTool, null);
  assert.equal(await lastReply(agents.get('agy'), '/work/app'), null);
});

test('session tokens: live statusline data first, then the transcript', async t => {
  const live = { model: 'Opus 5.5', tokens: 5000, size: 200_000, pct: 2, at: Date.now() };
  const { agents } = await fixture(t, { sessions: { [CLAUDE_FIRST]: live } });
  const claude = agents.get('claude');
  const fromStatusline = await claude.sessionTokens('/work/app', '4242');
  assert.deepEqual(fromStatusline, { model: 'Opus 5.5', context: 5000, window: 200_000, pct: 2 });
  assert.deepEqual(await claude.sessionTokens('/work/app', undefined), { model: 'claude-opus-5-5', context: 4050 });
  assert.equal(await claude.liveModel(CLAUDE_FIRST), 'Opus 5.5');
  assert.equal(await claude.liveModel(undefined), null);
  const codexTokens = await agents.get('codex').sessionTokens('/work/api');
  assert.deepEqual(codexTokens, { context: 1234, window: 272_000, total: 99_999 });
});

test('stale statusline data is ignored', async t => {
  const stale = { model: 'Old', tokens: 1, size: 2, pct: 3, at: Date.now() - 31 * 60_000 };
  const { agents } = await fixture(t, { sessions: { '/work/app': stale } });
  assert.deepEqual(await agents.get('claude').sessionTokens('/work/app'), { model: 'claude-opus-5-5', context: 4050 });
});

test('plan limits per agent', async t => {
  const now = Date.now() / 1000;
  const rate_limits = {
    five_hour: { used_percentage: 33.4, resets_at: now + HOUR_S },
    seven_day: { used_percentage: 5, resets_at: now - 10 },
    at: 1,
  };
  const { agents } = await fixture(t, { rate_limits });
  const limits = await agents.limits();
  assert.deepEqual(Object.keys(limits), ['claude', 'codex']);
  assert.equal(limits.claude.fiveHour.pct, 33);
  assert.equal(limits.claude.sevenDay, false);
  assert.deepEqual(limits.codex, {
    plan: 'plus',
    primary: { pct: 13, minutes: 300, resetsAt: 1_795_700_000_000 },
    secondary: { pct: 40, minutes: 10_080, resetsAt: 1_796_000_000_000 },
  });
});

test('installed agents are found on PATH', async t => {
  const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'termi-bin-'));
  t.after(() => fs.rm(bin, { recursive: true, force: true }));
  await fs.writeFile(path.join(bin, 'codex'), '', { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'claude'), '', { mode: 0o644 });
  const agents = createAgents({ home: '/h', dataDir: '/d' });
  assert.deepEqual(await agents.installed(`/nonexistent:${bin}`), [{ id: 'codex', name: 'Codex' }]);
  assert.deepEqual(await agents.installed(''), []);
});

test('reading the tail of a transcript returns newest lines first', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'termi-tail-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'a.jsonl');
  await fs.writeFile(file, 'one\ntwo\nthree\n');
  assert.deepEqual(await readTail(file), ['', 'three', 'two', 'one']);
  assert.deepEqual(await readTail(file, 6), ['', 'three']);
});
