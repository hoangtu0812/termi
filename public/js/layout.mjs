import { $, wide } from './dom.mjs';

export const SIDE_PANELS = ['sessions', 'files', 'git', 'ci'];
const MOVABLE = ['p-files', 'p-git', 'p-ci'];

export function placePanes() {
  const target = wide() ? $('sidebody') : $('panes');
  for (const id of MOVABLE) {
    const pane = $(id);
    if (pane.parentElement !== target) target.append(pane);
  }
}

export function sidePanel(s) {
  if (SIDE_PANELS.includes(s.t) && s.t !== 'sessions') return s.t;
  return SIDE_PANELS.includes(s.p) ? s.p : 'sessions';
}

export const mainView = s => (s.t === 'chat' ? 'chat' : 'term');
