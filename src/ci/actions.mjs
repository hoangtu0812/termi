import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fail } from '../errors.mjs';

const execFileAsync = promisify(execFile);
const CLI_OPTIONS = { timeout: 60_000, maxBuffer: 3e7 };
const MAX_LOG_LINES = 400;
const MAX_FAILED_STEPS = 3;
const API_VERSION = '7.1';
const ACTIONS = new Set(['rerun', 'cancel']);
const MAX_ERROR_CHARS = 300;
const ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g;

export const validAction = action => ACTIONS.has(action);
export const validRunId = id => /^\d{1,20}$/.test(String(id));

export function tailLines(text, limit = MAX_LOG_LINES) {
  const lines = String(text).replace(ANSI_ESCAPE, '').replace(/\s+$/, '').split('\n');
  return lines.length > limit ? lines.slice(-limit).join('\n') : lines.join('\n');
}

async function cli(exec, command, args) {
  try {
    return (await exec(command, args, CLI_OPTIONS)).stdout;
  } catch (error) {
    throw fail(502, String(error.stderr || error.message).trim().slice(0, MAX_ERROR_CHARS));
  }
}

const azureScope = remote => ['--org', `https://dev.azure.com/${remote.org}`];

function azureInvoke(remote, resource, params) {
  const route = Object.entries({ project: remote.project, ...params }).map(([k, v]) => `${k}=${v}`);
  return ['devops', 'invoke', '--area', 'build', '--resource', resource, '--route-parameters', ...route,
    ...azureScope(remote), '--api-version', API_VERSION, '--output', 'json'];
}

export function failedTasks(timeline) {
  return (timeline.records || [])
    .filter(record => record.type === 'Task' && record.result === 'failed' && record.log?.id)
    .slice(0, MAX_FAILED_STEPS);
}

async function azureLog(remote, run, exec) {
  const timeline = JSON.parse(await cli(exec, 'az', azureInvoke(remote, 'timeline', { buildId: run.id })));
  const parts = [];
  for (const task of failedTasks(timeline)) {
    const log = JSON.parse(await cli(exec, 'az', azureInvoke(remote, 'logs', { buildId: run.id, logId: task.log.id })));
    parts.push(`== ${task.name} ==\n${(log.value || []).join('\n')}`);
  }
  return parts.join('\n\n');
}

export async function runLog(remote, run, exec = execFileAsync) {
  const text = remote.provider === 'github'
    ? await cli(exec, 'gh', ['run', 'view', run.id, '--log-failed', '-R', `${remote.owner}/${remote.repo}`])
    : await azureLog(remote, run, exec);
  return { text: tailLines(text) || '(không có log lỗi)' };
}

function githubArgs(remote, run, action) {
  const repo = ['-R', `${remote.owner}/${remote.repo}`];
  if (action === 'cancel') return ['run', 'cancel', run.id, ...repo];
  return ['run', 'rerun', run.id, ...(run.result === 'failure' ? ['--failed'] : []), ...repo];
}

function azureArgs(remote, run, action) {
  const scope = [...azureScope(remote), '--project', remote.project, '--output', 'json'];
  if (action === 'cancel') return ['pipelines', 'build', 'cancel', '--build-id', run.id, ...scope];
  return ['pipelines', 'run', '--id', run.pipelineId, '--branch', run.ref, ...scope];
}

export async function runAction(remote, run, action, exec = execFileAsync) {
  const [command, args] = remote.provider === 'github'
    ? ['gh', githubArgs(remote, run, action)]
    : ['az', azureArgs(remote, run, action)];
  await cli(exec, command, args);
  return { ok: true };
}
