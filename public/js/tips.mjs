import { api, safely } from './api.mjs';
import { $, el } from './dom.mjs';
import { t } from './i18n.mjs';
import { icon } from './icons.mjs';
import { enablePush } from './push.mjs';
import { store } from './storage.mjs';

const ADD_MACHINE_GUIDE = 'https://github.com/hoangtu0812/termi#adding-a-windows-or-linux-machine';

async function pushReady() {
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => null);
  const subscription = await registration?.pushManager?.getSubscription().catch(() => null);
  return Boolean(subscription) && globalThis.Notification?.permission === 'granted';
}

async function tipStates() {
  const [push, info, machines] = await Promise.all([
    pushReady(),
    api('api/info').catch(() => ({})),
    api('api/machines').catch(() => []),
  ]);
  return {
    push,
    usage: Boolean(info.claudeUsage),
    machines: machines.filter(m => m.termi).length > 1,
  };
}

function tipRow(done, title, detail, action) {
  const row = el('button', 'htip' + (done ? ' done' : ''));
  row.type = 'button';
  const mark = el('span', 'hmark');
  mark.innerHTML = icon(done ? 'check' : 'plus');
  const text = el('div', 'htx');
  text.append(el('b', null, title), el('small', null, detail));
  row.append(mark, text);
  row.onclick = action;
  return row;
}

export async function firstRunTips() {
  const box = el('div', 'hcard htips');
  const head = el('div', 'hh');
  const hide = el('button', 'btn sm', t('Ẩn'));
  hide.type = 'button';
  hide.onclick = () => {
    store.set('termi-tips-done', '1');
    box.remove();
  };
  head.append(t('Bắt đầu nhanh'), hide);
  const states = await tipStates();
  box.append(
    head,
    tipRow(states.push, t('Bật thông báo đẩy'), t('Báo khi agent cần bạn hoặc đã xong việc'), safely(enablePush)),
    tipRow(states.usage, t('Hiện hạn mức Claude'), t('Cài statusline của termi trong một phiên Claude'),
      () => $('b-settings').click()),
    tipRow(states.machines, t('Thêm máy khác'), t('Windows hoặc Linux cùng tài khoản Tailscale'),
      () => window.open(ADD_MACHINE_GUIDE, '_blank', 'noopener')),
  );
  return box;
}
