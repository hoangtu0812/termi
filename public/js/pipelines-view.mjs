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

export function runActions(run) {
  const state = runState(run);
  const actions = ['web'];
  if (run.status === 'completed') actions.push('rerun');
  else actions.push('cancel');
  if (state === 'failure') actions.push('log');
  return actions;
}

const ACTION_LABELS = {
  web: () => t('Mở trên web'),
  rerun: () => t('Chạy lại'),
  cancel: () => t('Huỷ'),
  log: () => t('Log lỗi'),
};
const ACTION_ICONS = { web: 'send', rerun: 'refresh', cancel: 'x', log: 'doc' };

function actionBar(run, handlers) {
  const bar = el('div', 'ciacts');
  for (const action of runActions(run)) {
    const b = el('button', 'btn sm' + (action === 'cancel' ? ' danger' : ''));
    b.type = 'button';
    b.innerHTML = icon(ACTION_ICONS[action]);
    b.append(ACTION_LABELS[action]());
    b.onclick = () => handlers[action](run);
    bar.append(b);
  }
  return bar;
}

function runRow(run, handlers) {
  const wrap = el('div', 'ciwrap');
  const row = el('button', 'cirun');
  row.type = 'button';
  row.onclick = () => {
    const open = wrap.classList.toggle('open');
    if (open && !wrap.querySelector('.ciacts')) wrap.append(actionBar(run, handlers));
  };
  wrap.append(row);
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
  return wrap;
}

export function groupNodes(runs, handlers) {
  return GROUPS.flatMap(([status, title, empty]) => {
    const list = runs.filter(run => run.status === status);
    const head = el('div', 'grp');
    head.append(el('span', null, `${title()} (${list.length})`));
    return [head, ...(list.length ? list.map(run => runRow(run, handlers)) : [el('div', 'cinone', empty())])];
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
