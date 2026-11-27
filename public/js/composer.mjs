import { api, autosize, safely } from './api.mjs';
import { renderAtts } from './attachments.mjs';
import { queueMessage } from './outbox.mjs';
import { $, el, wide } from './dom.mjs';
import { S, cur, st } from './state.mjs';
import { store } from './storage.mjs';
import { fitTmux } from './terminal.mjs';
import { t } from './i18n.mjs';

const send = safely(async () => {
  const area = $('text');
  if (S.atts.some(a => !a.path)) throw new Error(t('Đợi tải lên xong đã'));
  const text = [area.value.trim(), ...S.atts.map(a => a.path)].filter(Boolean).join(' ');
  if (!text) return api('api/send', { session: st().s, key: 'Enter' });
  try {
    await api('api/send', { session: st().s, text, enter: true });
  } catch (e) {
    if (!e.offline) throw e;
    queueMessage(st().m || '', st().s, text);
  }
  if (area.value.trim()) rememberSent(area.value.trim());
  area.value = '';
  autosize(area);
  saveDraft();
  updateSuggest();
  navigator.vibrate?.(10);
  S.atts.forEach(a => a.url && URL.revokeObjectURL(a.url));
  S.atts = [];
  renderAtts();
});
const SLASH = {
  claude: [
    ['/compact', t('Thu gọn ngữ cảnh')],
    ['/clear', t('Bắt đầu hội thoại mới')],
    ['/model', t('Đổi model')],
    ['/context', t('Ngữ cảnh đang dùng')],
    ['/usage', t('Hạn mức gói')],
    ['/code-review', t('Review thay đổi')],
    ['/resume', t('Mở lại hội thoại')],
    ['/init', t('Tạo CLAUDE.md')],
    ['/memory', t('Sửa bộ nhớ')],
    ['/agents', 'Subagent'],
    ['/mcp', t('Máy chủ MCP')],
    ['/permissions', t('Quyền')],
    ['/help', t('Trợ giúp')],
  ],
  codex: [
    ['/compact', t('Thu gọn ngữ cảnh')],
    ['/review', t('Review thay đổi')],
    ['/model', t('Đổi model')],
    ['/status', t('Trạng thái, hạn mức')],
    ['/diff', 'Xem diff'],
    ['/new', t('Hội thoại mới')],
    ['/init', t('Tạo AGENTS.md')],
    ['/approvals', t('Chế độ duyệt lệnh')],
    ['/mention', t('Nhắc tới file')],
  ],
};
export const loadDraft = k => store.get('termi-draft:' + k) || '';
export function saveDraft() {
  if (S.draftFor) store.set('termi-draft:' + S.draftFor, $('text').value);
}
const sentList = () => {
  try {
    return JSON.parse(store.get('termi-sent') || '[]');
  } catch {
    return [];
  }
};
function rememberSent(area) {
  store.set('termi-sent', JSON.stringify([area, ...sentList().filter(x => x !== area)].slice(0, 20)));
}
function updateSuggest() {
  const area = $('text'),
    v = area.value,
    box = $('suggest');
  let items = [];
  if (/^\/\S*$/.test(v))
    items = (SLASH[cur()?.agent] || []).filter(([c]) => c.startsWith(v)).map(([c, d]) => [c, d, c + ' ']);
  box.hidden = !items.length;
  box.replaceChildren(
    ...items.map(([label, desc, fill]) => {
      const b = el('button', 'sg');
      b.type = 'button';
      b.append(el('b', null, label));
      if (desc) b.append(el('span', null, desc));
      b.onpointerdown = e => e.preventDefault();
      b.onclick = () => {
        area.value = fill;
        autosize(area);
        saveDraft();
        area.focus();
        updateSuggest();
      };
      return b;
    }),
  );
}
const KEYBOARD_RATIO = 0.78;
const BLUR_HIDE_MS = 150;

function watchKeyboard() {
  const tallest = new Map();
  const checkKeyboard = () => {
    const height = tallest.get(innerWidth) || 0;
    if (innerHeight > height) tallest.set(innerWidth, innerHeight);
    const typing = /TEXTAREA|INPUT/.test(document.activeElement?.tagName || '');
    const shrunk = innerHeight < (tallest.get(innerWidth) || innerHeight) * KEYBOARD_RATIO;
    document.body.classList.toggle('kb', typing && shrunk);
  };
  addEventListener('resize', checkKeyboard);
  document.addEventListener('focusin', () => setTimeout(checkKeyboard, 300));
  document.addEventListener('focusout', () => setTimeout(checkKeyboard, 100));
  checkKeyboard();
}

function onComposerKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && wide()) {
    e.preventDefault();
    send();
  }
  if (e.key === 'ArrowUp' && !e.target.value && sentList()[0]) {
    e.preventDefault();
    e.target.value = sentList()[0];
    autosize(e.target);
    saveDraft();
    updateSuggest();
  }
}

export function setupComposer() {
  $('b-send').onclick = send;
  $('b-send').onpointerdown = e => e.preventDefault();
  $('text').oninput = e => {
    autosize(e.target);
    saveDraft();
    updateSuggest();
  };
  $('text').onfocus = () => {
    updateSuggest();
    fitTmux();
  };
  $('text').onblur = () =>
    setTimeout(() => {
      $('suggest').hidden = true;
    }, BLUR_HIDE_MS);
  watchKeyboard();
  $('text').onkeydown = onComposerKey;
}
