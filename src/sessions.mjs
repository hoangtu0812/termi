import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { executableOf } from './agents/process.mjs';
import { fail } from './errors.mjs';
import { prettyModel } from './text.mjs';
import { target, tmux } from './tmux/client.mjs';
import { agentState, parseChoices, parseMulti, screenPreview } from './tmux/screen.mjs';
import { validName, validUuid } from './validate.mjs';

const run = promisify(execFile);
const PANE_FORMAT = [
  '#{session_name}', '#{window_active}#{pane_active}', '#{pane_pid}', '#{pane_current_path}',
  '#{session_attached}', '#{session_activity}', '#{window_activity}',
].join('\t');
const ACTIVE_PANE = '11';
const PS_MAX_BUFFER = 16e6;
const MAX_ANCESTORS = 64;
const INIT_PID = '1';
const CHANGE_CACHE_MS = 15_000;
const GIT_STATUS_TIMEOUT_MS = 5000;
const NO_RESUME = 'Agent này không mở lại được hội thoại cũ';

export function agentPanes(psOutput, detect) {
  const parent = new Map();
  const agents = [];
  for (const line of psOutput.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    parent.set(match[1], match[2]);
    const agent = detect(executableOf(match[3]));
    if (agent) agents.push([match[1], agent]);
  }
  const owners = new Map();
  for (const [agentPid, agent] of agents) {
    let pid = agentPid;
    for (let depth = 0; pid && pid !== INIT_PID && depth < MAX_ANCESTORS; depth++) {
      if (!owners.has(pid)) owners.set(pid, { agent, agentPid });
      pid = parent.get(pid);
    }
  }
  return owners;
}

function createChangeCounter(now) {
  const cache = new Map();
  const env = () => ({ ...process.env, GIT_OPTIONAL_LOCKS: '0' });
  return async function changeCount(dir) {
    const cached = cache.get(dir);
    if (cached && now() - cached.at < CHANGE_CACHE_MS) return cached.count;
    const args = ['-C', dir, 'status', '--porcelain=v1', '-z'];
    const count = await run('git', args, { timeout: GIT_STATUS_TIMEOUT_MS, env: env() })
      .then(result => result.stdout.split('\0').filter(Boolean).length, () => null);
    cache.set(dir, { at: now(), count });
    return count;
  };
}

async function readPanes() {
  try {
    return (await tmux('list-panes', '-a', '-F', PANE_FORMAT)).stdout.trim().split('\n');
  } catch {
    return null;
  }
}

async function paneOwners(agents) {
  const ps = await run('ps', ['-ax', '-o', 'pid=,ppid=,args='], { maxBuffer: PS_MAX_BUFFER });
  return agentPanes(ps.stdout, agents.detect);
}

function newSession(fields) {
  const [name, , , dir, attached, activity] = fields;
  return { name, dir, attached: attached !== '0', activity: Number(activity), agent: null };
}

async function groupPanes(lines, owners, agents) {
  const byName = new Map();
  for (const line of lines) {
    const fields = line.split('\t');
    const [name, active, pid, dir, , , output] = fields;
    const session = byName.get(name) ?? newSession(fields);
    if (active === ACTIVE_PANE) {
      session.dir = dir;
      session.output = Number(output);
    }
    if (!session.agent && owners.has(pid)) Object.assign(session, owners.get(pid));
    if (session.agent && session.agentPid && !session.convId) {
      const conversation = await agents.get(session.agent).conversation(session.agentPid);
      if (conversation?.id) session.convId = conversation.id;
      if (conversation?.title) session.title = conversation.title;
    }
    byName.set(name, session);
  }
  return [...byName.values()].sort((a, b) => b.activity - a.activity);
}

async function addAgentReply({ agents, lastReply }, session) {
  const adapter = agents.get(session.agent);
  const reply = await lastReply(adapter, session.dir, session.agentPid).catch(() => null);
  if (reply?.text && session.state !== 'waiting') {
    session.preview = reply.text;
    session.previewKind = 'reply';
  }
  session.model = (await adapter.liveModel(session.convId)) || prettyModel(reply?.model);
  session.replyAt = reply?.replyAt || null;
  if (session.state === 'working' && reply?.lastTool) session.doing = reply.lastTool;
}

async function readScreen(session) {
  const capture = await tmux('capture-pane', '-p', '-J', '-t', target(session.name)).catch(() => ({ stdout: '' }));
  const screen = capture.stdout;
  session.state = session.agent ? agentState(screen) : 'shell';
  if (session.state === 'waiting') {
    const single = parseChoices(screen);
    Object.assign(session, single.choices ? single : parseMulti(screen));
  }
  session.preview = screenPreview(screen);
  session.previewKind = 'screen';
}

function createStateClock(now) {
  const since = new Map();
  return session => {
    const changed = since.get(session.name)?.state !== session.state;
    if (changed) since.set(session.name, { state: session.state, since: now() });
    return since.get(session.name).since;
  };
}

function validateCreate(agents, request) {
  if (!validName(request.name)) throw fail(400, 'Tên phiên chỉ gồm chữ, số, - và _');
  if (request.resume != null && !validUuid(request.resume)) throw fail(400, 'Mã hội thoại không hợp lệ');
  if (request.agent != null && !agents.has(request.agent)) throw fail(400, 'Agent không hỗ trợ');
  const agent = request.agent == null ? null : agents.get(request.agent);
  if (request.resume != null && !agent?.resumeCommand) throw fail(400, NO_RESUME);
  return agent;
}

export function createSessions({ agents, lastReply, paths, now = Date.now }) {
  const changeCount = createChangeCounter(now);
  const stateSince = createStateClock(now);

  async function describe(session) {
    await readScreen(session);
    if (session.agent) await addAgentReply({ agents, lastReply }, session);
    session.since = stateSince(session);
  }

  async function list() {
    const lines = await readPanes();
    if (!lines) return [];
    const sessions = await groupPanes(lines, await paneOwners(agents), agents);
    const counts = await Promise.all(sessions.map(session => changeCount(session.dir)));
    sessions.forEach((session, index) => { session.changes = counts[index]; });
    await Promise.all(sessions.map(describe));
    return sessions;
  }

  async function find(name) {
    if (!validName(name)) throw fail(400, 'Phiên không hợp lệ');
    const session = (await list()).find(item => item.name === name);
    if (!session) throw fail(404, 'Không tìm thấy phiên');
    return session;
  }

  async function create(request) {
    const agent = validateCreate(agents, request);
    const dir = await paths.need(request.dir);
    const exists = () => { throw fail(409, 'Phiên đã tồn tại'); };
    await tmux('new-session', '-d', '-s', request.name, '-c', dir).catch(exists);
    if (!agent) return;
    const command = request.resume ? agent.resumeCommand(request.resume) : agent.command;
    await tmux('send-keys', '-t', target(request.name), command, 'Enter');
  }

  const resumeId = async session => (session.agent ? agents.get(session.agent).resumeId(session) : null);

  return { list, find, create, resumeId };
}
