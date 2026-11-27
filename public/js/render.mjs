import { autosize } from './api.mjs';
import { loadChat } from './chat.mjs';
import { loadDraft } from './composer.mjs';
import { renderConfirm } from './confirm.mjs';
import { $, splitWide, wide } from './dom.mjs';
import { loadFiles } from './files.mjs';
import { loadGit } from './git.mjs';
import { loadOtherMachines } from './machines.mjs';
import { poll } from './poll.mjs';
import { markSeen } from './seen.mjs';
import { loadProjects, renderSessions } from './sessions.mjs';
import { S, cur, go, st } from './state.mjs';
import { ensureTerm } from './terminal.mjs';
import { renderTop } from './topbar.mjs';
import { loadRestore, welcome } from './welcome.mjs';

const PANES = ['none', 'term', 'files', 'git', 'chat'];
const SESSION_TABS = new Set(['term', 'files', 'chat']);

function switchMachine(machine) {
  S.machine = machine;
  Object.assign(S, {
    list: [],
    loaded: false,
    dirs: null,
    termName: null,
    termKey: null,
    seen: {},
    git: null,
    restore: [],
    projects: null,
  });
  loadProjects();
  S.others = [];
  loadOtherMachines();
  loadRestore();
  $('machine').value = S.machine;
  poll();
}

function currentTab(s) {
  const tab = s.t || (s.s ? 'term' : 'sessions');
  return wide() && tab === 'sessions' ? 'term' : tab;
}

function showTab(tab, viewing) {
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('#tabbar button, #seg button')) {
    b.classList.toggle('on', b.dataset.t === tab);
  }
  $('viewer').hidden = !viewing;
  renderSessions();
  renderTop();
}

function showPanes(s, show, split, gone) {
  document.body.classList.toggle('split', !!split);
  for (const p of PANES) $('p-' + p).hidden = p !== show && !(split && p === 'term');
  $('composer').hidden = !(s.s && !gone && (show === 'term' || show === 'chat' || split));
  renderConfirm();
}

function restoreDraft(s, show) {
  const key = `${s.m || ''}/${s.s || ''}`;
  if (s.s && show !== 'none') markSeen(s.s);
  if (S.draftFor === key) return;
  S.draftFor = key;
  $('text').value = loadDraft(key);
  autosize($('text'));
}

function loadPane(s, show, split) {
  if (show === 'term' || split) ensureTerm(s.s);
  if (show === 'chat') loadChat(true);
  if (show === 'files') loadFiles(s.d || cur()?.dir);
  if (show === 'git') loadGit(s.g || cur()?.dir);
}

export function render() {
  const s = st();
  if ((s.m || '') !== S.machine) switchMachine(s.m || '');
  if (s.v && !$('v-body').childElementCount) return go({ v: null });
  const tab = currentTab(s);
  showTab(tab, s.v);
  const gone = s.s && S.loaded && !cur();
  const show = SESSION_TABS.has(tab) && (!s.s || gone) ? 'none' : tab;
  const split = splitWide() && s.s && !gone && (show === 'files' || show === 'git');
  showPanes(s, show, split, gone);
  restoreDraft(s, show);
  if (show === 'none') welcome($('p-none'));
  if (s.v) return;
  loadPane(s, show, split);
}
export function setupRender() {
  addEventListener('hashchange', render);
  addEventListener('resize', () => {
    const t = (wide() ? 'w' : 'n') + (splitWide() ? 's' : '');
    if (S.layout && S.layout !== t) render();
    S.layout = t;
  });
}
