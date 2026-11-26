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

export function render() {
  const s = st();
  if ((s.m || '') !== S.machine) {
    S.machine = s.m || '';
    Object.assign(S, {
      list: [],
      loaded: false,
      dirs: null,
      termName: null,
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
  if (s.v && !$('v-body').childElementCount) return go({ v: null });
  let tab = s.t || (s.s ? 'term' : 'sessions');
  if (wide() && tab === 'sessions') tab = 'term';
  document.body.dataset.tab = tab;
  for (const b of document.querySelectorAll('#tabbar button, #seg button'))
    b.classList.toggle('on', b.dataset.t === tab);
  $('viewer').hidden = !s.v;
  renderSessions();
  renderTop();
  const needSession = tab === 'term' || tab === 'files' || tab === 'chat';
  const gone = s.s && S.loaded && !cur();
  const show = needSession && (!s.s || gone) ? 'none' : tab;
  const split = splitWide() && s.s && !gone && (show === 'files' || show === 'git');
  document.body.classList.toggle('split', !!split);
  for (const p of ['none', 'term', 'files', 'git', 'chat']) $('p-' + p).hidden = p !== show && !(split && p === 'term');
  $('composer').hidden = !(s.s && !gone && (show === 'term' || show === 'chat' || split));
  renderConfirm();
  const dk = `${s.m || ''}/${s.s || ''}`;
  if (s.s && show !== 'none') markSeen(s.s);
  if (S.draftFor !== dk) {
    S.draftFor = dk;
    $('text').value = loadDraft(dk);
    autosize($('text'));
  }
  if (show === 'none') welcome($('p-none'));
  if (s.v) return;
  if (show === 'term' || split) ensureTerm(s.s);
  if (show === 'chat') loadChat(true);
  if (show === 'files') loadFiles(s.d || cur()?.dir);
  if (show === 'git') loadGit(s.g || cur()?.dir);
}
export function setupRender() {
  addEventListener('hashchange', render);
  addEventListener('resize', () => {
    const t = (wide() ? 'w' : 'n') + (splitWide() ? 's' : '');
    if (S.layout && S.layout !== t) render();
    S.layout = t;
  });
}
