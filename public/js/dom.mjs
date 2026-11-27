import { t } from './i18n.mjs';
export const $ = id => document.getElementById(id);
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
export const short = d => (d || '').replace(/^\/Users\/[^/]+/, '~');
export const ltr = s => '‎' + s + '‎';
export const ago = ts => {
  const s = (Date.now() - ts) / 1000;
  return s < 60
    ? t('vừa xong')
    : s < 3600
      ? t('{0} phút trước', (s / 60) | 0)
      : s < 86400
        ? t('{0} giờ trước', (s / 3600) | 0)
        : t('{0} ngày trước', (s / 86400) | 0);
};
export const size = n =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
export const STATE = { working: t('Đang chạy'), waiting: t('Chờ bạn xác nhận'), idle: t('Rảnh'), shell: 'Shell' };
const AGENT_NAMES = { claude: 'Claude', codex: 'Codex', agy: 'Antigravity' };
export const agentName = a => AGENT_NAMES[a] || 'agent';
export const wide = () => matchMedia('(min-width: 900px)').matches;
export const splitWide = () => matchMedia('(min-width: 1200px)').matches;
export const dur = ts => {
  const x = (Date.now() - ts) / 1000;
  return x < 60
    ? t('{0} giây', Math.max(1, x | 0))
    : x < 3600
      ? t('{0} phút', (x / 60) | 0)
      : t('{0} giờ {1} phút', (x / 3600) | 0, ((x % 3600) / 60) | 0);
};
export const skel = (n, cls = 'sk') => Array.from({ length: n }, () => el('div', cls));
