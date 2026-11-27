import { api, safely, toast } from './api.mjs';
import { $ } from './dom.mjs';
import { killSession, renameSession } from './session-actions.mjs';
import { S, go, st } from './state.mjs';

const TAB_VIBRATION_MS = 6;

export function openSessionMenu(name) {
  S.menuFor = name;
  $('m-title').textContent = name;
  $('d-menu').showModal();
  api('api/notify')
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
      v = $('d-menu').returnValue;
    if (v === 'rename') await renameSession(name);
    else if (v === 'mute') {
      const p = await api('api/notify'),
        key = `${st().m || ''}/${name}`,
        muted = new Set(p.muted);
      muted.has(key) ? muted.delete(key) : muted.add(key);
      await api('api/notify', { ...p, muted: [...muted] });
      toast(muted.has(key) ? `Đã tắt thông báo của ${name}` : `Đã bật lại thông báo của ${name}`);
    } else if (v === 'kill') await killSession(name);
  });
  $('b-back').onclick = () => go({ t: 'sessions', v: null });
  for (const b of document.querySelectorAll('#tabbar button, #seg button')) {
    b.onclick = () => {
      if (st().t !== b.dataset.t) navigator.vibrate?.(TAB_VIBRATION_MS);
      go({ t: b.dataset.t, v: null });
    };
  }
}
