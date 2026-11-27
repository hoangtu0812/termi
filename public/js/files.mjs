import { api, safely } from './api.mjs';
import { $, ago, el, size, skel } from './dom.mjs';
import { renderCrumb } from './file-crumb.mjs';
import { icon } from './icons.mjs';
import { S, go } from './state.mjs';
import { openFile } from './viewer.mjs';
import { t } from './i18n.mjs';

const GIT_MARK_LABELS = {
  M: () => t('Đã sửa'),
  A: () => t('Mới thêm'),
  D: () => t('Đã xoá'),
  U: () => t('Chưa theo dõi'),
  R: () => t('Đổi tên'),
};

const FT = {};
const ft = (exts, ic, color) =>
  exts.split(' ').forEach(e => {
    FT[e] = [ic, color];
  });
export function fileIcon(f) {
  if (f.dir) return ['folder', f.name.startsWith('.') ? 'var(--faint)' : 'var(--blue)'];
  const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
  return FT[ext] || ['file', 'var(--dim)'];
}
export const loadFiles = safely(async wanted => {
  const dir = wanted || (await api('api/info')).roots[0];
  if (S.filesDir !== dir) $('f-list').replaceChildren(...skel(7));
  const r = await api('api/ls?dir=' + encodeURIComponent(dir));
  S.filesDir = r.dir;
  renderCrumb(r.dir);
  $('f-up').disabled = !r.parent;
  $('f-up').onclick = () => go({ d: r.parent });
  $('f-list').replaceChildren(
    ...r.entries.map(f => {
      const b = el('button', 'row' + (f.dir ? ' dir' : '')),
        [ic, color] = fileIcon(f);
      b.innerHTML = icon(ic);
      b.firstChild.style.color = color;
      b.append(el('span', 'nm', f.name), el('span', 'meta', f.dir ? '' : `${size(f.size)} · ${ago(f.mtime)}`));
      if (f.git) {
        const g = el('span', f.git === '•' ? 'gdot' : 'badge ' + f.git, f.git === '•' ? '' : f.git);
        g.title =
          f.git === '•'
            ? t('Có thay đổi bên trong')
            : GIT_MARK_LABELS[f.git]?.() || f.git;
        b.append(g);
      }
      b.onclick = () => (f.dir ? go({ d: f.path }) : openFile(f.path));
      return b;
    }),
  );
  if (!r.entries.length) $('f-list').replaceChildren(el('div', 'empty', t('Thư mục trống')));
});
export function setupFiles() {
  ft('js mjs cjs jsx', 'code', '#d4b106');
  ft('ts tsx', 'code', '#3178c6');
  ft('py', 'code', '#4b8bbe');
  ft('sh bash zsh ps1 bat', 'code', '#4eaa25');
  ft('html htm vue svelte', 'code', '#e34f26');
  ft('css scss sass less', 'code', '#a074c4');
  ft('go', 'code', '#00add8');
  ft('rs', 'code', '#dea584');
  ft('java kt gradle', 'code', '#f89820');
  ft('swift', 'code', '#f05138');
  ft('c h cpp hpp cc cs', 'code', '#659ad2');
  ft('rb', 'code', '#cc342d');
  ft('php', 'code', '#777bb4');
  ft('dart', 'code', '#0175c2');
  ft('sql', 'code', '#e38c00');
  ft('json jsonc json5', 'braces', '#cbcb41');
  ft('md mdx txt rst', 'doc', '#6aa7ff');
  ft('pdf', 'doc', '#ef6b73');
  ft('yml yaml toml ini env conf cfg xml lock', 'doc', 'var(--faint)');
  ft('png jpg jpeg gif webp svg ico bmp avif', 'image', '#c678dd');
  $('f-home').onclick = () => go({ d: null });
  $('f-reload').onclick = () => loadFiles(S.filesDir);
}
