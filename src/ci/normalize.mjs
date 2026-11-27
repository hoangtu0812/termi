const AZURE_STATUS = { notStarted: 'queued', postponed: 'queued', inProgress: 'running', cancelling: 'running' };
const AZURE_RESULT = { succeeded: 'success', partiallySucceeded: 'warning', failed: 'failure', canceled: 'cancelled' };
const AZURE_TRIGGER = {
  pullRequest: 'pr',
  manual: 'manual',
  individualCI: 'push',
  batchedCI: 'push',
  schedule: 'schedule',
  resourceTrigger: 'other',
};
const GITHUB_STATUS = {
  queued: 'queued',
  waiting: 'queued',
  requested: 'queued',
  pending: 'queued',
  in_progress: 'running',
};
const GITHUB_RESULT = { success: 'success', failure: 'failure', cancelled: 'cancelled', timed_out: 'failure' };
const GITHUB_TRIGGER = {
  pull_request: 'pr',
  pull_request_target: 'pr',
  workflow_dispatch: 'manual',
  push: 'push',
  schedule: 'schedule',
};
const SHORT_SHA = 8;

const time = value => (value ? Date.parse(value) || null : null);
const branchName = ref => String(ref || '').replace(/^refs\/heads\//, '');

export function githubRun(run) {
  const status = GITHUB_STATUS[run.status] || 'completed';
  return {
    id: String(run.id),
    number: `#${run.run_number}`,
    title: run.display_title || run.name,
    pipeline: run.name,
    pipelineId: String(run.workflow_id),
    status,
    result: status === 'completed' ? GITHUB_RESULT[run.conclusion] || 'other' : null,
    trigger: GITHUB_TRIGGER[run.event] || 'other',
    branch: run.head_branch || '',
    sha: String(run.head_sha || '').slice(0, SHORT_SHA),
    actor: run.actor?.login || '',
    queuedAt: time(run.created_at),
    startedAt: time(run.run_started_at),
    finishedAt: status === 'completed' ? time(run.updated_at) : null,
    url: run.html_url,
  };
}

function pullRequestSource(run) {
  try {
    return branchName(JSON.parse(run.parameters || '{}')['system.pullRequest.sourceBranch']);
  } catch {
    return '';
  }
}

function azureTitle(run, subjects, source) {
  const sha = run.sourceVersion || '';
  if (subjects.has(sha)) return subjects.get(sha);
  const pr = run.triggerInfo?.['pr.number'];
  if (pr) return source ? `PR ${pr} · ${source}` : `PR ${pr}`;
  return sha.slice(0, SHORT_SHA);
}

export function azureRun(run, { org, project }, subjects = new Map()) {
  const status = run.status === 'completed' ? 'completed' : AZURE_STATUS[run.status] || 'queued';
  const web = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`;
  const source = pullRequestSource(run);
  return {
    id: String(run.id),
    number: `#${run.buildNumber}`,
    title: azureTitle(run, subjects, source),
    pipeline: run.definition?.name || '',
    pipelineId: String(run.definition?.id ?? ''),
    status,
    result: status === 'completed' ? AZURE_RESULT[run.result] || 'other' : null,
    trigger: AZURE_TRIGGER[run.reason] || 'other',
    branch: source || branchName(run.sourceBranch),
    sha: String(run.sourceVersion || '').slice(0, SHORT_SHA),
    actor: run.requestedFor?.displayName || '',
    queuedAt: time(run.queueTime),
    startedAt: time(run.startTime),
    finishedAt: time(run.finishTime),
    url: `${web}/_build/results?buildId=${run.id}`,
  };
}

export function pipelinesOf(runs) {
  const byId = new Map();
  for (const run of runs) {
    const entry = byId.get(run.pipelineId) || { id: run.pipelineId, name: run.pipeline, recent: [] };
    if (entry.recent.length < 3) entry.recent.push(run.status === 'completed' ? run.result : run.status);
    byId.set(run.pipelineId, entry);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
