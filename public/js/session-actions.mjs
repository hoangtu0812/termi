import { api, safely } from './api.mjs';
import { el, wide } from './dom.mjs';
import { icon } from './icons.mjs';
import { poll } from './poll.mjs';
import { S, go, st } from './state.mjs';
import { t } from './i18n.mjs';

const KILL_VIBRATION_MS = 20;

export async function renameSession(name) {
  const to = prompt(t('Tên mới (chữ, số, - và _):'), name);
  if (!to || to === name) return;
  await api('api/sessions/rename', { name, to });
  await poll();
  if (name !== st().s) return;
  S.termName = null;
  S.termKey = null;
  go({ s: to });
}

export async function killSession(name) {
  if (!confirm(t('Đóng phiên "{0}"? Agent và mọi tiến trình trong phiên sẽ dừng.', name))) return;
  await api('api/sessions/kill', { name });
  navigator.vibrate?.(KILL_VIBRATION_MS);
  await poll();
  if (name === st().s) go({ s: null, t: wide() ? null : 'sessions' });
}

const ACTIONS = [
  ['edit', t('Đổi tên'), renameSession],
  ['x', t('Đóng phiên'), killSession],
];

export function sessionActions(name) {
  const box = el('span', 'sacts');
  for (const [iconName, label, action] of ACTIONS) {
    const a = el('span', 'sact');
    a.setAttribute('role', 'button');
    a.setAttribute('aria-label', `${label} ${name}`);
    a.title = label;
    a.innerHTML = icon(iconName);
    a.onclick = e => {
      e.stopPropagation();
      safely(action)(name);
    };
    box.append(a);
  }
  return box;
}
