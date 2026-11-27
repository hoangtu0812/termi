import { api } from './api.mjs';
import { loadChat } from './chat.mjs';
import { el, short } from './dom.mjs';
import { loadEvents } from './inbox.mjs';
import { startLive, stopLive } from './live.mjs';
import { checkStale } from './reconnect.mjs';
import { renderSessions } from './sessions.mjs';
import { S, st } from './state.mjs';
import { pruneTerms } from './terminal.mjs';
import { renderTop } from './topbar.mjs';

export async function poll() {
  try {
    if (!S.dirs || S.dirsFor !== (st().m || '') || Date.now() - S.dirsAt > 60_000) {
      S.dirsFor = st().m || '';
      S.dirsAt = Date.now();
      S.dirs = await api('api/dirs').catch(() => null);
    }
    S.polledAt = Date.now();
    const list = await api('api/sessions');
    loadEvents();
    applyList(list);
  } catch {}
}

function applyList(list) {
  S.list = list;
  S.loaded = true;
  pruneTerms();
  checkStale();
  if (st().t === 'chat' && st().s) loadChat();
  renderSessions();
  renderTop();
}

export function connectLive() {
  startLive(list => {
    applyList(list);
    loadEvents();
  });
}
export async function loadRepos(select, selected, fresh) {
  if (fresh || !S.dirs) S.dirs = await api('api/dirs').catch(() => ({ roots: [], recent: [] }));
  const opts = [...new Set([selected, ...S.dirs.recent].filter(Boolean))];
  select.replaceChildren(
    ...opts.map(d => {
      const o = el('option', null, short(d));
      o.value = d;
      o.selected = d === selected;
      return o;
    }),
  );
}
const POLL_MS = 3000;
const LIVE_POLL_MS = 15_000;

const pollDue = () => !S.live || Date.now() - (S.polledAt || 0) >= LIVE_POLL_MS;

function onVisibility() {
  if (document.visibilityState !== 'visible') return stopLive();
  connectLive();
  poll();
}

export function setupPoll() {
  setInterval(() => document.visibilityState === 'visible' && pollDue() && poll(), POLL_MS);
  document.addEventListener('visibilitychange', onVisibility);
  connectLive();
}
