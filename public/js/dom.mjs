export const $ = id => document.getElementById(id);
export const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
export const short = d => (d || '').replace(/^\/Users\/[^/]+/, '~');
export const ltr = s => '‎' + s + '‎';
export const ago = t => {
  const s = (Date.now() - t) / 1000;
  return s < 60
    ? 'vừa xong'
    : s < 3600
      ? `${(s / 60) | 0} phút trước`
      : s < 86400
        ? `${(s / 3600) | 0} giờ trước`
        : `${(s / 86400) | 0} ngày trước`;
};
export const size = n =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
export const STATE = { working: 'Đang chạy', waiting: 'Chờ bạn xác nhận', idle: 'Rảnh', shell: 'Shell' };
const AGENT_NAMES = { claude: 'Claude', codex: 'Codex', agy: 'Antigravity' };
export const agentName = a => AGENT_NAMES[a] || 'agent';
export const wide = () => matchMedia('(min-width: 900px)').matches;
export const splitWide = () => matchMedia('(min-width: 1200px)').matches;
export const dur = t => {
  const x = (Date.now() - t) / 1000;
  return x < 60
    ? `${Math.max(1, x | 0)} giây`
    : x < 3600
      ? `${(x / 60) | 0} phút`
      : `${(x / 3600) | 0} giờ ${((x % 3600) / 60) | 0} phút`;
};
export const skel = (n, cls = 'sk') => Array.from({ length: n }, () => el('div', cls));
