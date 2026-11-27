import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fail } from '../errors.mjs';
import { git } from '../git/run.mjs';
import { azureRun, githubRun } from './normalize.mjs';

const execFileAsync = promisify(execFile);
const RUN_LIMIT = 40;
const CLI_OPTIONS = { timeout: 45_000, maxBuffer: 3e7 };
const FULL_SHA = /^[0-9a-f]{40}$/;
const NEEDS_GH = 'Cần cài GitHub CLI và đăng nhập: gh auth login';
const NEEDS_AZ = 'Cần Azure CLI có extension azure-devops và đăng nhập: az login';
const MAX_ERROR_CHARS = 300;

function cliError(error, needs) {
  if (error.code === 'ENOENT') return fail(400, needs);
  const detail = String(error.stderr || error.message || '').trim();
  if (/auth login|az login|not logged|login required|TF400813|401/i.test(detail)) return fail(400, needs);
  return fail(502, detail.slice(0, MAX_ERROR_CHARS) || needs);
}

async function cliJson(exec, command, args, needs) {
  try {
    return JSON.parse((await exec(command, args, CLI_OPTIONS)).stdout);
  } catch (error) {
    throw error instanceof SyntaxError ? fail(502, needs) : cliError(error, needs);
  }
}

export async function githubRuns({ owner, repo }, exec = execFileAsync) {
  const args = ['api', `repos/${owner}/${repo}/actions/runs?per_page=${RUN_LIMIT}`];
  const data = await cliJson(exec, 'gh', args, NEEDS_GH);
  return (data.workflow_runs || []).map(githubRun);
}

async function commitSubjects(dir, shas) {
  const known = [...new Set(shas.filter(sha => FULL_SHA.test(sha)))];
  const pairs = await Promise.all(known.map(sha =>
    git(dir, 'log', '-1', '--format=%s', sha).then(subject => [sha, subject.trim()], () => null)));
  return new Map(pairs.filter(pair => pair?.[1]));
}

export async function azureRuns(remote, dir, exec = execFileAsync) {
  const args = [
    'pipelines', 'runs', 'list', '--org', `https://dev.azure.com/${remote.org}`, '--project', remote.project,
    '--top', String(RUN_LIMIT), '--output', 'json',
  ];
  const raw = (await cliJson(exec, 'az', args, NEEDS_AZ))
    .filter(run => !run.repository?.name || run.repository.name === remote.repo);
  const subjects = await commitSubjects(dir, raw.map(run => run.sourceVersion));
  return raw.map(run => azureRun(run, remote, subjects));
}

export function pipelinesPage(remote) {
  if (remote.provider === 'github') return `https://github.com/${remote.owner}/${remote.repo}/actions`;
  return `https://dev.azure.com/${encodeURIComponent(remote.org)}/${encodeURIComponent(remote.project)}/_build`;
}
