import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCi } from '../src/ci/index.mjs';
import { azureRun, githubRun, pipelinesOf } from '../src/ci/normalize.mjs';
import { azureRuns, githubRuns } from '../src/ci/providers.mjs';
import { parseRemote } from '../src/ci/remote.mjs';

test('remotes from GitHub and Azure DevOps are recognized', () => {
  const gh = { provider: 'github', owner: 'hoangtu0812', repo: 'termi' };
  assert.deepEqual(parseRemote('https://github.com/hoangtu0812/termi.git'), gh);
  assert.deepEqual(parseRemote('git@github.com:hoangtu0812/termi.git'), gh);
  assert.deepEqual(parseRemote('ssh://git@github.com/hoangtu0812/termi'), gh);
  const az = { provider: 'azure', org: 'bsr-idt', project: 'BSR IBP', repo: 'BSR-IBP' };
  assert.deepEqual(parseRemote('https://bsr-idt@dev.azure.com/bsr-idt/BSR%20IBP/_git/BSR-IBP'), az);
  assert.deepEqual(parseRemote('git@ssh.dev.azure.com:v3/bsr-idt/BSR%20IBP/BSR-IBP'), az);
  assert.deepEqual(parseRemote('https://bsr-idt.visualstudio.com/DefaultCollection/BSR%20IBP/_git/BSR-IBP'), az);
  assert.equal(parseRemote('https://gitlab.com/a/b.git'), null);
  assert.equal(parseRemote('https://github.com/a/b;rm -rf'), null);
  assert.equal(parseRemote(''), null);
});

test('GitHub and Azure runs share one shape', () => {
  const gh = githubRun({
    id: 1, run_number: 29, name: 'CI', display_title: 'fix: x', status: 'in_progress', conclusion: null,
    event: 'pull_request', head_branch: 'feat/a', head_sha: 'abcdef1234567890', actor: { login: 'tu' },
    created_at: '2026-11-27T02:00:00Z', run_started_at: '2026-11-27T02:00:05Z', workflow_id: 9, html_url: 'u',
  });
  assert.equal(gh.status, 'running');
  assert.equal(gh.result, null);
  assert.equal(gh.trigger, 'pr');
  assert.equal(gh.sha, 'abcdef12');
  const parameters = JSON.stringify({ 'system.pullRequest.sourceBranch': 'refs/heads/fix/a' });
  const az = azureRun({
    id: 807, buildNumber: '20261127.8', status: 'completed', result: 'failed', reason: 'pullRequest',
    sourceBranch: 'refs/pull/252/merge', sourceVersion: 'eca67d84cb54d74e5eb2ed8e8c670fed8cf2ca62', parameters,
    triggerInfo: { 'pr.number': '252' }, definition: { id: 7, name: 'IBP - TEST' },
    requestedFor: { displayName: 'Tu' }, queueTime: '2026-11-27T02:37:04Z', finishTime: '2026-11-27T02:40:05Z',
  }, { org: 'bsr-idt', project: 'BSR IBP' });
  assert.equal(az.title, 'PR 252 · fix/a');
  assert.equal(az.branch, 'fix/a');
  assert.equal(az.result, 'failure');
  assert.equal(az.url, 'https://dev.azure.com/bsr-idt/BSR%20IBP/_build/results?buildId=807');
  assert.deepEqual(Object.keys(az).sort(), Object.keys(gh).sort());
});

test('pipelines keep the three most recent states', () => {
  const run = (pipelineId, status, result) => ({ pipelineId, pipeline: `P${pipelineId}`, status, result });
  const runs = [run(1, 'running', null), run(1, 'completed', 'failure'), run(2, 'completed', 'success'),
    run(1, 'completed', 'success'), run(1, 'completed', 'success')];
  assert.deepEqual(pipelinesOf(runs), [
    { id: 1, name: 'P1', recent: ['running', 'failure', 'success'] },
    { id: 2, name: 'P2', recent: ['success'] },
  ]);
});

test('CLI failures become clear messages', async () => {
  const missing = async () => { throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }); };
  await assert.rejects(githubRuns({ owner: 'a', repo: 'b' }, missing), { status: 400, message: /gh auth login/ });
  const loggedOut = async () => {
    throw Object.assign(new Error('x'), { stderr: 'Please run az login to setup account.' });
  };
  await assert.rejects(azureRuns({ org: 'o', project: 'p', repo: 'r' }, '/tmp', loggedOut), { message: /az login/ });
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const other = { id: 1, status: 'notStarted', repository: { name: 'other' } };
    const mine = { id: 2, status: 'inProgress', repository: { name: 'r' }, definition: { id: 3, name: 'P' } };
    return { stdout: JSON.stringify([other, mine]) };
  };
  const runs = await azureRuns({ org: 'o', project: 'p', repo: 'r' }, '/tmp', exec);
  assert.deepEqual(runs.map(r => [r.id, r.status]), [['2', 'running']]);
  assert.equal(calls[0][0], 'az');
});

test('a folder without a known remote has no pipelines', async () => {
  const ci = createCi({ fetchRuns: { github: async () => [], azure: async () => [] } });
  assert.deepEqual(await ci.list('/definitely/not/a/repo'), { provider: null });
});
