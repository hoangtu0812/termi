import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failedTasks, runAction, runLog, tailLines, validAction, validRunId } from '../src/ci/actions.mjs';

const github = { provider: 'github', owner: 'o', repo: 'r' };
const azure = { provider: 'azure', org: 'org', project: 'Proj X', repo: 'r' };
const recorder = (outputs = []) => {
  const calls = [];
  const exec = async (command, args) => {
    calls.push([command, ...args]);
    return { stdout: outputs.shift() ?? '' };
  };
  return { calls, exec };
};

test('run ids and actions are validated', () => {
  assert.equal(validRunId('807'), true);
  assert.equal(validRunId('8; rm'), false);
  assert.equal(validAction('rerun'), true);
  assert.equal(validAction('delete'), false);
});

test('logs keep only the last lines and failed tasks', () => {
  assert.equal(tailLines('a\nb\nc\n', 2), 'b\nc');
  assert.equal(tailLines('\u001b[33mWARN\u001b[0m ok'), 'WARN ok');
  const records = [
    { type: 'Task', result: 'failed', log: { id: 7 }, name: 'Install' },
    { type: 'Task', result: 'succeeded', log: { id: 8 } },
    { type: 'Job', result: 'failed', log: { id: 21 } },
  ];
  assert.deepEqual(failedTasks({ records }).map(r => r.log.id), [7]);
});

test('GitHub re-run, cancel and failed log use gh with the repository', async () => {
  const { calls, exec } = recorder(['', '', '', 'boom\n']);
  await runAction(github, { id: '5', result: 'failure' }, 'rerun', exec);
  await runAction(github, { id: '5', result: 'success' }, 'rerun', exec);
  await runAction(github, { id: '5' }, 'cancel', exec);
  const log = await runLog(github, { id: '5' }, exec);
  assert.deepEqual(calls, [
    ['gh', 'run', 'rerun', '5', '--failed', '-R', 'o/r'],
    ['gh', 'run', 'rerun', '5', '-R', 'o/r'],
    ['gh', 'run', 'cancel', '5', '-R', 'o/r'],
    ['gh', 'run', 'view', '5', '--log-failed', '-R', 'o/r'],
  ]);
  assert.equal(log.text, 'boom');
});

test('Azure re-run queues the pipeline on the same ref and reads failed task logs', async () => {
  const timeline = JSON.stringify({ records: [{ type: 'Task', result: 'failed', log: { id: 7 }, name: 'Install' }] });
  const lines = JSON.stringify({ value: ['line 1', '##[error]exit 1'] });
  const { calls, exec } = recorder(['{}', '{}', timeline, lines]);
  const run = { id: '805', pipelineId: '7', ref: 'refs/heads/develop' };
  await runAction(azure, run, 'rerun', exec);
  await runAction(azure, run, 'cancel', exec);
  const log = await runLog(azure, run, exec);
  assert.deepEqual(calls[0].slice(0, 6), ['az', 'pipelines', 'run', '--id', '7', '--branch']);
  assert.equal(calls[0][6], 'refs/heads/develop');
  assert.ok(calls[0].includes('Proj X'));
  assert.deepEqual(calls[1].slice(0, 5), ['az', 'pipelines', 'build', 'cancel', '--build-id']);
  assert.ok(calls[3].includes('logId=7'));
  assert.equal(log.text, '== Install ==\nline 1\n##[error]exit 1');
});

test('CLI errors become 502 with the CLI message', async () => {
  const exec = async () => { throw Object.assign(new Error('x'), { stderr: 'run 5 not found' }); };
  await assert.rejects(runAction(github, { id: '5' }, 'cancel', exec), { status: 502, message: 'run 5 not found' });
});
