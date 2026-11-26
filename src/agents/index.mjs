import fs from 'node:fs/promises';
import path from 'node:path';
import { createClaudeAgent } from './claude.mjs';
import { createCodexAgent } from './codex.mjs';
import { binaryName } from './process.mjs';

const DEFAULTS = {
  resumeCommand: null,
  conversation: async () => null,
  transcriptFile: async () => null,
  chatEvents: () => [],
  message: () => null,
  model: () => null,
  sessionTokens: async () => null,
  limits: null,
  liveModel: async () => null,
  resumeId: async () => null,
  history: null,
};

const antigravity = {
  id: 'agy',
  name: 'Antigravity',
  command: 'agy',
  matchProcess: exe => binaryName(exe) === 'agy',
};

const isExecutable = file => fs.access(file, fs.constants.X_OK).then(() => true, () => false);

async function onPath(command, dirs) {
  for (const dir of dirs) {
    if (await isExecutable(path.join(dir, command))) return true;
  }
  return false;
}

export function createAgents({ home, dataDir }) {
  const list = [createClaudeAgent({ home, dataDir }), createCodexAgent({ home }), antigravity]
    .map(agent => ({ ...DEFAULTS, ...agent }));
  const byId = new Map(list.map(agent => [agent.id, agent]));

  async function installed(pathVariable = process.env.PATH || '') {
    const dirs = pathVariable.split(':').filter(Boolean);
    const found = await Promise.all(list.map(async agent => (await onPath(agent.command, dirs)) && agent));
    return found.filter(Boolean).map(agent => ({ id: agent.id, name: agent.name }));
  }

  async function limits() {
    const reporting = list.filter(agent => agent.limits);
    return Object.fromEntries(await Promise.all(reporting.map(async agent => [agent.id, await agent.limits()])));
  }

  return {
    list,
    get: id => byId.get(id) || null,
    has: id => byId.has(id),
    nameOf: id => byId.get(id)?.name || 'Agent',
    detect: executable => list.find(agent => agent.matchProcess(executable))?.id || null,
    installed,
    limits,
  };
}
