import { api, safely, toast } from './api.mjs';
import { $, wide } from './dom.mjs';
import { poll } from './poll.mjs';
import { S, go, st } from './state.mjs';

export function openSessionMenu(name) {
  S.menuFor = name;
  $('m-title').textContent = name;
  $('d-menu').showModal();
  api('/api/notify')
    .then(p => {
      $('m-mute').lastChild.textContent = p.muted.includes(`${st().m || ''}/${name}`)
        ? 'Bật lại thông báo phiên này'
        : 'Tắt thông báo phiên này';
    })
    .catch(() => {});
}
export function setupNavigation() {
  $('b-menu').onclick = () => openSessionMenu(st().s);
  $('d-menu').onclose = safely(async () => {
    const name = S.menuFor || st().s,
      v = $('d-menu').returnValue,
      isOpen = name === st().s;
    if (v === 'rename') {
      const to = prompt('Tên mới (chữ, số, - và _):', name);
      if (!to || to === name) return;
      await api('/api/sessions/rename', { name, to });
      await poll();
      if (isOpen) {
        S.termName = null;
        go({ s: to });
      }
    } else if (v === 'mute') {
      const p = await api('/api/notify'),
        key = `${st().m || ''}/${name}`,
        muted = new Set(p.muted);
      muted.has(key) ? muted.delete(key) : muted.add(key);
      await api('/api/notify', { ...p, muted: [...muted] });
      toast(muted.has(key) ? `Đã tắt thông báo của ${name}` : `Đã bật lại thông báo của ${name}`);
    } else if (v === 'kill') {
      if (!confirm(`Đóng phiên "${name}"? Agent và mọi tiến trình trong phiên sẽ dừng.`)) return;
      await api('/api/sessions/kill', { name });
      await poll();
      if (isOpen) go({ s: null, t: wide() ? null : 'sessions' });
    }
  });
  $('b-back').onclick = () => go({ t: 'sessions', v: null });
  for (const b of document.querySelectorAll('#tabbar button, #seg button'))
    b.onclick = () => go({ t: b.dataset.t, v: null });
}
