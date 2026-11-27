import { api, toast } from './api.mjs';
import { $, ago, el } from './dom.mjs';
import { icon } from './icons.mjs';
import { enablePush } from './push.mjs';
import { S, go } from './state.mjs';
import { t } from './i18n.mjs';

const KIND_ICONS = { waiting: 'bell', done: 'check', system: 'gauge', cifail: 'zap', cidone: 'zap' };

const seenKey = 'termi-events-seen';
const getSeen = () => {
  try {
    return Number(localStorage.getItem(seenKey)) || 0;
  } catch {
    return 0;
  }
};
export async function loadEvents() {
  const ev = await api('api/events').catch(() => null);
  if (!ev) return;
  if (S.events)
    for (const e of ev.filter(e => e.t > S.events[0]?.t || !S.events.length).reverse()) {
      toast(e.title);
      navigator.vibrate?.(e.kind === 'waiting' ? [120, 60, 120] : 40);
    }
  S.events = ev;
  const unseen = ev.filter(e => e.t > getSeen()).length;
  $('b-bell').dataset.badge = unseen ? String(Math.min(unseen, 9)) : '';
  if ($('d-inbox').open) renderInbox();
}
function renderInbox() {
  const list = S.events || [];
  $('inbox-list').replaceChildren(
    ...(list.length
      ? list.map(e => {
          const b = el('button', 'irow');
          b.type = 'button';
          const ic = el('span', 'ik ' + e.kind);
          ic.innerHTML = icon(KIND_ICONS[e.kind] || 'check');
          const node = el('div', 'it');
          node.append(el('b', null, e.title), el('small', null, `${ago(e.t)}${e.body ? ' · ' + e.body : ''}`));
          b.append(ic, node);
          b.onclick = () => {
            $('d-inbox').close();
            if (e.session) go({ s: e.session, t: 'term', m: e.machine || null, d: null, g: null, v: null });
          };
          return b;
        })
      : [el('div', 'empty', t('Chưa có thông báo nào'))]),
  );
}
export function setupInbox() {
  $('b-bell').onclick = async () => {
    renderInbox();
    $('d-inbox').showModal();
    try {
      localStorage.setItem(seenKey, String(Date.now()));
    } catch {}
    $('b-bell').dataset.badge = '';
    const reg = await navigator.serviceWorker?.getRegistration();
    const on = !!(await reg?.pushManager?.getSubscription()) && Notification.permission === 'granted';
    $('inbox-push').textContent = on ? t('Thông báo đẩy: đang bật · gửi thử') : t('Bật thông báo đẩy');
  };
  $('inbox-push').onclick = () => enablePush();
}
