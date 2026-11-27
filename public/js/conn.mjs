import { $ } from './dom.mjs';
import { S } from './state.mjs';
import { t } from './i18n.mjs';

const SECOND_MS = 1000;
const MINUTE_S = 60;
const LABELS = {
  ok: t('Đã kết nối'),
  wait: t('Đang kết nối lại…'),
  off: t('Mất kết nối tới máy chủ'),
};
const state = { online: true, server: true, term: 'none' };

export function connLevel({ online, server, term }) {
  if (!online || !server) return 'off';
  if (term === 'down' || term === 'probe') return 'wait';
  return 'ok';
}

export function ageLabel(lastData, now = Date.now()) {
  if (!lastData) return '';
  const seconds = Math.max(0, Math.round((now - lastData) / SECOND_MS));
  if (seconds < MINUTE_S) return t('terminal nhận dữ liệu {0} giây trước', seconds);
  return t('terminal nhận dữ liệu {0} phút trước', Math.round(seconds / MINUTE_S));
}

export const currentLevel = () => connLevel(state);

export function connText() {
  const age = state.term === 'none' ? '' : ageLabel(S.lastData);
  return [LABELS[connLevel(state)], age].filter(Boolean).join(' · ');
}

function renderConn() {
  S.onConn?.();
  const dot = $('conn');
  if (!dot) return;
  const level = connLevel(state);
  dot.className = 'conn ' + level;
  dot.title = connText();
  dot.setAttribute('aria-label', LABELS[level]);
}

export function setServer(up) {
  const recovered = up && !state.server;
  state.server = up;
  renderConn();
  if (recovered) dispatchEvent(new Event('termi:server-up'));
}

export function setTerm(term) {
  state.term = term;
  renderConn();
}

export function setupConn(onTap) {
  const sync = () => {
    state.online = navigator.onLine;
    renderConn();
  };
  addEventListener('online', sync);
  addEventListener('offline', sync);
  $('conn').addEventListener('pointerenter', renderConn);
  $('conn').onclick = () => onTap(connText());
  sync();
}
