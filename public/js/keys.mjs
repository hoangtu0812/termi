import { api, safely } from './api.mjs';
import { $, el } from './dom.mjs';
import { st } from './state.mjs';
import { fontSize, setFont } from './terminal.mjs';
import { openViewer } from './viewer.mjs';

const KEYS = [
  ['Esc', 'Escape'],
  ['⇧Tab', 'BTab'],
  ['^C', 'C-c'],
  ['↑', 'Up'],
  ['↓', 'Down'],
  ['←', 'Left'],
  ['→', 'Right'],
  ['Tab', 'Tab'],
  ['⏎', 'Enter'],
  ['PgUp', 'PageUp'],
  ['PgDn', 'PageDown'],
  ['^D', 'C-d'],
];
const copyBtn = el('button', 'fs', '📋 Chép');
export function setupKeys() {
  $('keys').append(
    ...KEYS.map(([label, key]) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.onclick = safely(() => api('/api/send', { session: st().s, key }));
      return b;
    }),
    ...[
      ['A−', -1, 'Chữ nhỏ hơn'],
      ['A+', 1, 'Chữ to hơn'],
    ].map(([label, d, name]) => {
      const b = el('button', 'fs', label);
      b.type = 'button';
      b.setAttribute('aria-label', name);
      b.onclick = () => setFont(fontSize + d);
      return b;
    }),
  );
  copyBtn.type = 'button';
  copyBtn.setAttribute('aria-label', 'Mở chữ trong phiên để chọn và sao chép');
  copyBtn.onclick = safely(async () => {
    const { text } = await api(`/api/capture?session=${encodeURIComponent(st().s)}&lines=2000`);
    openViewer(`Chữ trong phiên ${st().s}`, el('pre', 'copytext', text || '(trống)'));
    requestAnimationFrame(() => {
      $('v-body').scrollTop = $('v-body').scrollHeight;
    });
  });
  $('keys').prepend(copyBtn);
}
