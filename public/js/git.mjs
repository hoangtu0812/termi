import { api, autosize, safely, toast } from './api.mjs';
import { openDiff } from './diff.mjs';
import { $, el, ltr, skel } from './dom.mjs';
import { commitRow } from './git-graph.mjs';
import { icon } from './icons.mjs';
import { loadRepos } from './poll.mjs';
import { S, go } from './state.mjs';
import { group } from './usage.mjs';
import { openFile } from './viewer.mjs';

export const loadGit = safely(async dir => {
  await loadRepos($('g-repo'), dir);
  for (const o of $('g-repo').options) {
    o.title = o.value;
    o.textContent = o.value.split('/').pop() || o.value;
  }
  dir ||= $('g-repo').value;
  if (!dir) return $('g-changes').replaceChildren(el('div', 'empty', 'Không tìm thấy repo git nào'));
  let g;
  if (S.git?.dir !== dir) {
    $('g-changes').replaceChildren(...skel(3));
    $('g-log').replaceChildren(...skel(6));
  }
  try {
    g = await api('/api/git?dir=' + encodeURIComponent(dir));
  } catch (e) {
    $('g-changes').replaceChildren(el('div', 'empty', e.message));
    $('g-log').replaceChildren();
    $('g-branch').replaceChildren();
    $('g-track').textContent = '';
    return;
  }
  S.git = g;
  const [branch, track = ''] = g.head.split('...');
  const ahead = /ahead (\d+)/.exec(track)?.[1],
    behind = /behind (\d+)/.exec(track)?.[1];
  const chip = $('g-track');
  chip.className = 'chip' + (behind ? ' behind' : ahead ? ' ahead' : track ? ' synced' : '');
  chip.textContent = !track
    ? 'chưa có upstream'
    : /\[gone\]/.test(track)
      ? 'upstream đã mất'
      : ahead || behind
        ? [ahead && `↑${ahead}`, behind && `↓${behind}`].filter(Boolean).join(' ')
        : '✓ đồng bộ';
  chip.title = !track
    ? 'Nhánh chưa liên kết với remote'
    : `${ahead || 0} commit chưa push · ${behind || 0} commit chưa pull`;
  $('g-branch').replaceChildren(
    ...[...new Set([branch, ...g.branches])].map(b => {
      const o = el('option', null, b === branch ? `⎇ ${b}` : b);
      o.value = b;
      o.selected = b === branch;
      return o;
    }),
  );
  $('g-branch').dataset.cur = branch;
  const staged = g.files.filter(f => f.x !== ' ' && f.x !== '?');
  const changed = g.files.filter(f => f.y !== ' ');
  const group = (title, files, isStaged) => {
    if (!files.length) return [];
    const h = el('div', 'grp');
    h.append(el('span', null, `${title} (${files.length})`));
    const all = el('button', 'btn sm', isStaged ? 'Bỏ stage hết' : 'Stage hết');
    all.onclick = () => gitOp(isStaged ? 'unstage' : 'stage', { paths: files.map(f => f.path) });
    h.append(all);
    return [
      h,
      ...files.map(f => {
        const code = isStaged ? f.x : f.y === '?' ? 'U' : f.y;
        const r = el('div', 'chg');
        const p = el('span', 'p', ltr(f.path));
        p.title = f.path;
        p.onclick = () =>
          f.y === '?'
            ? openFile(g.dir + '/' + f.path)
            : openDiff(f.path, { dir: g.dir, file: f.path, ...(isStaged ? { staged: 1 } : {}) });
        const act = el('button', 'ibtn');
        act.innerHTML = icon(isStaged ? 'minus' : 'plus');
        act.setAttribute('aria-label', isStaged ? 'Bỏ stage' : 'Stage');
        act.onclick = () => gitOp(isStaged ? 'unstage' : 'stage', { paths: [f.path] });
        r.append(el('span', 'badge ' + code, code), p, act);
        return r;
      }),
    ];
  };
  const nodes = [...group('Đã stage', staged, true), ...group('Thay đổi', changed, false)];
  $('g-changes').replaceChildren(...(nodes.length ? nodes : [el('div', 'empty', 'Không có thay đổi nào ✓')]));
  $('g-commit-box').hidden = !staged.length;
  $('g-log').replaceChildren(...g.commits.map((c, i) => commitRow(c, g.graph.rows[i], g.graph.width, g.dir)));
});
const gitOp = safely(async (op, extra = {}) => {
  const btns = document.querySelectorAll('#p-git button');
  btns.forEach(b => (b.disabled = true));
  try {
    if (['fetch', 'pull', 'push'].includes(op)) toast(`Đang ${op}…`);
    const r = await api('/api/git/op', { dir: S.git.dir, op, ...extra });
    if (r.output && op !== 'stage' && op !== 'unstage') toast(r.output.split('\n').slice(-3).join('\n'));
    if (op === 'commit') $('g-msg').value = '';
  } finally {
    btns.forEach(b => (b.disabled = false));
    await loadGit(S.git.dir);
  }
});
export function setupGit() {
  for (const b of document.querySelectorAll('[data-op]')) b.onclick = () => gitOp(b.dataset.op);
  $('g-commit').onclick = () => gitOp('commit', { message: $('g-msg').value });
  $('g-msg').oninput = e => autosize(e.target);
  $('g-repo').onchange = () => go({ g: $('g-repo').value });
  $('g-reload').onclick = () => loadGit(S.git?.dir || $('g-repo').value);
  $('g-all').onclick = () => openDiff('Thay đổi chưa commit', { dir: S.git.dir });
  $('g-branch').onchange = e => {
    const b = e.target.value;
    if (confirm(`Chuyển sang branch "${b}"?`)) gitOp('checkout', { branch: b });
    else e.target.value = e.target.dataset.cur;
  };
}
