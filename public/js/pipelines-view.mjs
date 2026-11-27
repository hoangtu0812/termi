import { ago, el } from './dom.mjs';
import { t } from './i18n.mjs';
import { icon } from './icons.mjs';

const GROUPS = [
  ['queued', () => t('Đang chờ'), () => t('Không có lần chạy nào đang chờ')],
  ['running', () => t('Đang chạy'), () => t('Không có lần chạy nào đang chạy')],
  ['completed', () => t('Đã xong'), () => t('Chưa có lần chạy nào')],
];
const STATE_ICONS = {
  success: 'check',
  failure: 'x',
  cancelled: 'minus',
  warning: 'minus',
  running: 'refresh',
  queued: 'clock',
};
const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 3600;

export function runState(run) {
  return run.status === 'completed' ? run.result || 'other' : run.status;
}

export function duration(run, now = Date.now()) {
  if (run.startedAt == null) return '';
  const seconds = Math.max(0, Math.round(((run.finishedAt || now) - run.startedAt) / SECOND_MS));
  if (seconds < MINUTE_S) return `${seconds}s`;
  if (seconds < HOUR_S) return `${Math.floor(seconds / MINUTE_S)}m ${seconds % MINUTE_S}s`;
  return `${Math.floor(seconds / HOUR_S)}h ${Math.floor((seconds % HOUR_S) / MINUTE_S)}m`;
}

export function visibleRuns(runs, { pipeline, branch }) {
  return runs.filter(run => (!pipeline || run.pipelineId === pipeline) && (!branch || run.branch === branch));
}

function triggerLabel(run) {
  if (run.trigger === 'pr') return t('PR tự động');
  if (run.trigger === 'manual') return t('Chạy tay bởi {0}', run.actor);
  if (run.trigger === 'push') return t('Push bởi {0}', run.actor);
  if (run.trigger === 'schedule') return t('Theo lịch');
  return run.actor;
}

function stateBadge(state) {
  const badge = el('span', `cis ${state}`);
  badge.innerHTML = icon(STATE_ICONS[state] || 'minus');
  return badge;
}

function runRow(run) {
  const row = el('button', 'cirun');
  row.type = 'button';
  row.title = run.url;
  row.onclick = () => window.open(run.url, '_blank', 'noopener');
  const body = el('div', 'cib');
  body.append(el('div', 'cit', `${run.number} · ${run.title}`));
  const meta = el('div', 'cim');
  meta.append(el('span', 'cip', run.pipeline), el('span', null, triggerLabel(run)));
  if (run.branch) meta.append(el('span', 'cibr', run.branch));
  if (run.sha && run.sha !== run.title) meta.append(el('span', 'cisha', run.sha));
  body.append(meta);
  const when = el('div', 'ciw');
  when.append(el('span', null, ago(run.finishedAt || run.startedAt || run.queuedAt)), el('span', null, duration(run)));
  row.append(stateBadge(runState(run)), body, when);
  return row;
}

export function groupNodes(runs) {
  return GROUPS.flatMap(([status, title, empty]) => {
    const list = runs.filter(run => run.status === status);
    const head = el('div', 'grp');
    head.append(el('span', null, `${title()} (${list.length})`));
    return [head, ...(list.length ? list.map(runRow) : [el('div', 'cinone', empty())])];
  });
}

export function pipelineChip(pipeline, active, onPick) {
  const chip = el('button', 'fchip' + (active ? ' on' : ''));
  chip.type = 'button';
  chip.append(pipeline ? pipeline.name : t('Tất cả'));
  if (pipeline) {
    const dots = el('span', 'cidots');
    dots.append(...pipeline.recent.map(state => el('i', state)));
    chip.append(dots);
  }
  chip.onclick = onPick;
  return chip;
}
