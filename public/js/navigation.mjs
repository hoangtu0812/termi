import { api, safely, toast } from './api.mjs';
import { $, wide } from './dom.mjs';
import { killSession, renameSession } from './session-actions.mjs';
import { S, go, st } from './state.mjs';
import { t } from './i18n.mjs';
import { CODE_TABS, codeTab } from './tab-memory.mjs';
import { SIDE_PANELS } from './layout.mjs';

const TAB_VIBRATION_MS = 6;
const SHORTCUT_TABS = { Digit1: 'chat', Digit2: 'term', Digit3: 'files', Digit4: 'git', Digit5: 'ci' };

export function openSessionMenu(name) {
  S.menuFor = name;
  $('m-title').textContent = name;
  $('d-menu').showModal();
  api('api/notify')
    .then(p => {
      $('m-mute').lastChild.textContent = p.muted.includes(`${st().m || ''}/${name}`)
        ? t('Bật lại thông báo phiên này')
        : t('Tắt thông báo phiên này');
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
      toast(muted.has(key) ? t('Đã tắt thông báo của {0}', name) : t('Đã bật lại thông báo của {0}', name));
    } else if (v === 'kill') await killSession(name);
  });
  $('b-back').onclick = () => go({ t: 'sessions', v: null });
  for (const b of document.querySelectorAll('#tabbar button, #seg button, #codetabs button, #acts button')) {
    b.onclick = () => openTab(b.dataset.t === 'code' ? codeTab() : b.dataset.t);
  }
  document.addEventListener('keydown', tabKey, true);
}

function openTab(tab) {
  if (wide() && SIDE_PANELS.includes(tab)) {
    const keepMain = CODE_TABS.includes(st().t) ? { t: null } : {};
    return go({ p: tab, ...keepMain });
  }
  if (st().t !== tab) navigator.vibrate?.(TAB_VIBRATION_MS);
  go({ t: tab, v: null });
}

export function tabKey(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const tab = SHORTCUT_TABS[e.code];
  if (!tab) return;
  e.preventDefault();
  e.stopPropagation();
  openTab(tab);
}
