import { api, safely } from './api.mjs';
import { $, el, skel } from './dom.mjs';
import { t } from './i18n.mjs';
import { groupNodes, pipelineChip, runState, visibleRuns } from './pipelines-view.mjs';
import { loadRepos } from './poll.mjs';
import { S, cur, go, st } from './state.mjs';

const REFRESH_MS = 15_000;
const BADGE_REFRESH_MS = 60_000;

const ciDir = () => st().g || cur()?.dir || '';

function filterRow(data) {
  const row = el('div', 'cifilters');
  const pick = pipeline => () => {
    S.ciPipeline = pipeline;
    renderPipelines();
  };
  row.append(pipelineChip(null, !S.ciPipeline, pick(null)));
  for (const pipeline of data.pipelines) {
    row.append(pipelineChip(pipeline, S.ciPipeline === pipeline.id, pick(pipeline.id)));
  }
  if (data.branch) {
    const only = el('button', 'fchip' + (S.ciBranchOnly ? ' on' : ''), t('Nhánh {0}', data.branch));
    only.type = 'button';
    only.onclick = () => {
      S.ciBranchOnly = !S.ciBranchOnly;
      renderPipelines();
    };
    row.append(only);
  }
  return row;
}

function header(data) {
  const head = el('div', 'cihead');
  const open = el('a', 'btn sm', t('Mở trên web'));
  open.href = data.page;
  open.target = '_blank';
  open.rel = 'noopener';
  const name = data.provider === 'github' ? 'GitHub Actions' : 'Azure Pipelines';
  head.append(el('b', null, name), el('span', null, data.repo), open);
  return head;
}

function renderPipelines() {
  const box = $('g-ci');
  const data = S.ci;
  if (!data) return;
  if (data.error) return box.replaceChildren(el('div', 'empty', t(data.error)));
  if (!data.provider) {
    return box.replaceChildren(el('div', 'empty', t('Repo này không dùng GitHub hoặc Azure DevOps')));
  }
  const filters = { pipeline: S.ciPipeline, branch: S.ciBranchOnly ? data.branch : null };
  box.replaceChildren(header(data), filterRow(data), ...groupNodes(visibleRuns(data.runs, filters)));
}

export function ciBadge(data) {
  if (!data?.runs?.length) return null;
  const mine = data.branch ? data.runs.filter(run => run.branch === data.branch) : [];
  const latest = (mine.length ? mine : data.runs)[0];
  const state = runState(latest);
  if (state === 'running' || state === 'queued') return 'running';
  return state === 'failure' ? 'failure' : null;
}

async function fetchCi(dir, fresh) {
  const query = `dir=${encodeURIComponent(dir)}${fresh ? '&fresh=1' : ''}`;
  try {
    return { dir, ...(await api(`api/ci?${query}`)) };
  } catch (error) {
    return { dir, error: error.message };
  }
}

export const loadPipelines = safely(async ({ fresh = false } = {}) => {
  const dir = ciDir();
  await loadRepos($('ci-repo'), dir);
  for (const o of $('ci-repo').options) o.textContent = o.value.split('/').pop() || o.value;
  if (!dir) return $('g-ci').replaceChildren(el('div', 'empty', t('Không tìm thấy repo git nào')));
  if (S.ci?.dir !== dir) $('g-ci').replaceChildren(...skel(5));
  const data = await fetchCi(dir, fresh);
  if (ciDir() !== dir) return;
  S.ci = data;
  S.ciState = { dir, badge: ciBadge(data) };
  renderPipelines();
  S.onCiChange?.();
});

const refreshBadge = safely(async () => {
  const dir = cur()?.dir;
  if (!dir || st().t === 'ci') return;
  const data = await fetchCi(dir, false);
  S.ciState = { dir, badge: ciBadge(data) };
  S.onCiChange?.();
});

const visible = () => document.visibilityState === 'visible';

export function setupPipelines() {
  $('ci-repo').onchange = () => go({ g: $('ci-repo').value });
  $('ci-reload').onclick = () => loadPipelines({ fresh: true });
  setInterval(() => visible() && st().t === 'ci' && loadPipelines(), REFRESH_MS);
  setInterval(() => visible() && refreshBadge(), BADGE_REFRESH_MS);
  setTimeout(refreshBadge, REFRESH_MS / 3);
}
