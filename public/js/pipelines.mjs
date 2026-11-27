import { api, safely } from './api.mjs';
import { $, el, skel } from './dom.mjs';
import { t } from './i18n.mjs';
import { groupNodes, pipelineChip, visibleRuns } from './pipelines-view.mjs';
import { S, st } from './state.mjs';
import { store } from './storage.mjs';

const MODE_KEY = 'termi-git-mode';
const REFRESH_MS = 15_000;

const currentBranch = () => $('g-branch').dataset.cur || '';
const repoDir = () => S.git?.dir || $('g-repo').value;

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
  const branch = currentBranch();
  if (branch) {
    const only = el('button', 'fchip' + (S.ciBranchOnly ? ' on' : ''), t('Nhánh {0}', branch));
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
  const filters = { pipeline: S.ciPipeline, branch: S.ciBranchOnly ? currentBranch() : null };
  box.replaceChildren(header(data), filterRow(data), ...groupNodes(visibleRuns(data.runs, filters)));
}

export const loadPipelines = safely(async ({ fresh = false } = {}) => {
  const dir = repoDir();
  if (!dir || S.gitMode !== 'ci') return;
  if (S.ci?.dir !== dir) $('g-ci').replaceChildren(...skel(5));
  const query = `dir=${encodeURIComponent(dir)}${fresh ? '&fresh=1' : ''}`;
  try {
    S.ci = { dir, ...(await api(`api/ci?${query}`)) };
  } catch (error) {
    S.ci = { dir, error: error.message };
  }
  if (repoDir() === dir) renderPipelines();
});

function showMode() {
  $('g-main').hidden = S.gitMode === 'ci';
  $('g-ci').hidden = S.gitMode !== 'ci';
  for (const b of $('g-mode').querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === S.gitMode);
}

export function setGitMode(mode) {
  S.gitMode = mode;
  store.set(MODE_KEY, mode);
  showMode();
  loadPipelines();
}

export function setupPipelines() {
  S.gitMode = store.get(MODE_KEY) === 'ci' ? 'ci' : 'git';
  showMode();
  for (const b of $('g-mode').querySelectorAll('button')) b.onclick = () => setGitMode(b.dataset.mode);
  setInterval(() => {
    if (document.visibilityState === 'visible' && st().t === 'git' && S.gitMode === 'ci') loadPipelines();
  }, REFRESH_MS);
}
