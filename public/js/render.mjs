import { autosize } from './api.mjs';
import { loadChat } from './chat.mjs';
import { loadDraft } from './composer.mjs';
import { renderConfirm } from './confirm.mjs';
import { $, wide } from './dom.mjs';
import { loadFiles } from './files.mjs';
import { loadGit } from './git.mjs';
import { loadOtherMachines } from './machines.mjs';
import { connectLive, poll } from './poll.mjs';
import { markSeen } from './seen.mjs';
import { loadProjects, renderSessions } from './sessions.mjs';
import { S, cur, go, st } from './state.mjs';
import { ensureTerm } from './terminal.mjs';
import { renderTop } from './topbar.mjs';
import { loadRestore, welcome } from './welcome.mjs';
import { loadPipelines } from './pipelines.mjs';
import { renderTabBadges } from './tab-badges.mjs';
import { CODE_TABS, codeTab, rememberTab } from './tab-memory.mjs';
import { mainView, placePanes, sidePanel } from './layout.mjs';

const PANES = ['none', 'term', 'files', 'git', 'ci', 'chat'];
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
  connectLive();
  poll();
}

function currentTab(s) {
  const tab = s.t === 'code' ? codeTab() : s.t || (s.s ? 'term' : 'sessions');
  return wide() && tab === 'sessions' ? 'term' : tab;
}

function markTabs(main, panel) {
  const inCode = CODE_TABS.includes(main);
  for (const b of document.querySelectorAll('#tabbar button, #seg button, #codetabs button')) {
    b.classList.toggle('on', b.dataset.t === main || (b.dataset.t === 'code' && inCode));
  }
  for (const b of document.querySelectorAll('#acts button')) b.classList.toggle('on', b.dataset.t === panel);
}

function showTab(tab, viewing, panel) {
  document.body.dataset.tab = tab;
  document.body.dataset.panel = panel;
  markTabs(tab, panel);
  $('codetabs').hidden = wide() || !CODE_TABS.includes(tab);
  $('viewer').hidden = !viewing;
  renderSessions();
  renderTop();
}

function showPanes(s, show, panel, gone) {
  for (const p of PANES) $('p-' + p).hidden = p !== show && p !== panel;
  $('spanel-sessions').hidden = wide() && panel !== 'sessions';
  $('composer').hidden = !(s.s && !gone && (show === 'term' || show === 'chat'));
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

function loadPane(s, view) {
  if (view === 'term') ensureTerm(s.s);
  if (view === 'chat') loadChat(true);
  if (view === 'files') loadFiles(s.d || cur()?.dir);
  if (view === 'git') loadGit(s.g || cur()?.dir);
  if (view === 'ci') loadPipelines();
}

function views(s) {
  if (!wide()) return { tab: currentTab(s), panel: null };
  return { tab: mainView(s), panel: sidePanel(s) };
}

export function render() {
  const s = st();
  if ((s.m || '') !== S.machine) switchMachine(s.m || '');
  if (s.v && !$('v-body').childElementCount) return go({ v: null });
  placePanes();
  const { tab, panel } = views(s);
  showTab(tab, s.v, panel);
  const gone = s.s && S.loaded && !cur();
  const show = SESSION_TABS.has(tab) && (!s.s || gone) ? 'none' : tab;
  showPanes(s, show, panel, gone);
  restoreDraft(s, show);
  if (s.s && !gone) rememberTab(s.s, tab);
  renderTabBadges();
  if (show === 'none') welcome($('p-none'));
  if (s.v) return;
  loadPane(s, show);
  if (panel && panel !== 'sessions') loadPane(s, panel);
}
export function setupRender() {
  addEventListener('hashchange', render);
  addEventListener('resize', () => {
    const t = wide() ? 'w' : 'n';
    if (S.layout && S.layout !== t) render();
    S.layout = t;
  });
}
