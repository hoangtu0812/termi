import { api, autosize, safely } from './api.mjs';
import { renderAtts } from './attachments.mjs';
import { $, el, wide } from './dom.mjs';
import { S, cur, st } from './state.mjs';
import { store } from './storage.mjs';
import { fitTmux } from './terminal.mjs';

const SEND_VIBRATION_MS = 10;

const send = safely(async () => {
  const t = $('text');
  if (S.atts.some(a => !a.path)) throw new Error('Đợi tải lên xong đã');
  const text = [t.value.trim(), ...S.atts.map(a => a.path)].filter(Boolean).join(' ');
  if (!text) return api('/api/send', { session: st().s, key: 'Enter' });
  await api('/api/send', { session: st().s, text, enter: true });
  navigator.vibrate?.(SEND_VIBRATION_MS);
  if (t.value.trim()) rememberSent(t.value.trim());
  t.value = '';
  autosize(t);
  saveDraft();
  updateSuggest();
  navigator.vibrate?.(10);
  S.atts.forEach(a => a.url && URL.revokeObjectURL(a.url));
  S.atts = [];
  renderAtts();
});
const SLASH = {
  claude: [
    ['/compact', 'Thu gọn ngữ cảnh'],
    ['/clear', 'Bắt đầu hội thoại mới'],
    ['/model', 'Đổi model'],
    ['/context', 'Ngữ cảnh đang dùng'],
    ['/usage', 'Hạn mức gói'],
    ['/code-review', 'Review thay đổi'],
    ['/resume', 'Mở lại hội thoại'],
    ['/init', 'Tạo CLAUDE.md'],
    ['/memory', 'Sửa bộ nhớ'],
    ['/agents', 'Subagent'],
    ['/mcp', 'Máy chủ MCP'],
    ['/permissions', 'Quyền'],
    ['/help', 'Trợ giúp'],
  ],
  codex: [
    ['/compact', 'Thu gọn ngữ cảnh'],
    ['/review', 'Review thay đổi'],
    ['/model', 'Đổi model'],
    ['/status', 'Trạng thái, hạn mức'],
    ['/diff', 'Xem diff'],
    ['/new', 'Hội thoại mới'],
    ['/init', 'Tạo AGENTS.md'],
    ['/approvals', 'Chế độ duyệt lệnh'],
    ['/mention', 'Nhắc tới file'],
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
function rememberSent(t) {
  store.set('termi-sent', JSON.stringify([t, ...sentList().filter(x => x !== t)].slice(0, 20)));
}
function updateSuggest() {
  const t = $('text'),
    v = t.value,
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
        t.value = fill;
        autosize(t);
        saveDraft();
        t.focus();
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
