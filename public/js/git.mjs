import { api, autosize, safely, toast } from './api.mjs';
import { openDiff } from './diff.mjs';
import { $, el, ltr, skel } from './dom.mjs';
import { logRows } from './git-log.mjs';
import { icon } from './icons.mjs';
import { loadRepos } from './poll.mjs';
import { S, go } from './state.mjs';
import { openFile } from './viewer.mjs';

export function trackingState(track) {
  const ahead = /ahead (\d+)/.exec(track)?.[1];
  const behind = /behind (\d+)/.exec(track)?.[1];
  if (!track) return { cls: '', text: 'chưa có upstream', title: 'Nhánh chưa liên kết với remote' };
  const title = `${ahead || 0} commit chưa push · ${behind || 0} commit chưa pull`;
  let cls = ' synced';
  if (behind) cls = ' behind';
  else if (ahead) cls = ' ahead';
  let text = '✓ đồng bộ';
  if (/\[gone\]/.test(track)) text = 'upstream đã mất';
  else if (ahead || behind) text = [ahead && `↑${ahead}`, behind && `↓${behind}`].filter(Boolean).join(' ');
  return { cls, text, title };
}

function showTracking(track) {
  const chip = $('g-track');
  const state = trackingState(track);
  chip.className = 'chip' + state.cls;
  chip.textContent = state.text;
  chip.title = state.title;
}

function showBranches(branch, branches) {
  const options = [...new Set([branch, ...branches])].map(b => {
    const o = el('option', null, b === branch ? `⎇ ${b}` : b);
    o.value = b;
    o.selected = b === branch;
    return o;
  });
  $('g-branch').replaceChildren(...options);
  $('g-branch').dataset.cur = branch;
}

function changeRow(g, f, isStaged) {
  const code = isStaged ? f.x : f.y === '?' ? 'U' : f.y;
  const r = el('div', 'chg');
  const p = el('span', 'p', ltr(f.path));
  p.title = f.path;
  const diffQuery = { dir: g.dir, file: f.path, ...(isStaged ? { staged: 1 } : {}) };
  p.onclick = () => (f.y === '?' ? openFile(g.dir + '/' + f.path) : openDiff(f.path, diffQuery));
  const act = el('button', 'ibtn');
  act.innerHTML = icon(isStaged ? 'minus' : 'plus');
  act.setAttribute('aria-label', isStaged ? 'Bỏ stage' : 'Stage');
  act.onclick = () => gitOp(isStaged ? 'unstage' : 'stage', { paths: [f.path] });
  r.append(el('span', 'badge ' + code, code), p, act);
  return r;
}

function changeGroup(g, title, files, isStaged) {
  if (!files.length) return [];
  const h = el('div', 'grp');
  h.append(el('span', null, `${title} (${files.length})`));
  const all = el('button', 'btn sm', isStaged ? 'Bỏ stage hết' : 'Stage hết');
  all.onclick = () => gitOp(isStaged ? 'unstage' : 'stage', { paths: files.map(f => f.path) });
  h.append(all);
  return [h, ...files.map(f => changeRow(g, f, isStaged))];
}

function showChanges(g) {
  const staged = g.files.filter(f => f.x !== ' ' && f.x !== '?');
  const changed = g.files.filter(f => f.y !== ' ');
  const nodes = [...changeGroup(g, 'Đã stage', staged, true), ...changeGroup(g, 'Thay đổi', changed, false)];
  $('g-changes').replaceChildren(...(nodes.length ? nodes : [el('div', 'empty', 'Không có thay đổi nào ✓')]));
  $('g-commit-box').hidden = !staged.length;
}

function showGitError(message) {
  $('g-changes').replaceChildren(el('div', 'empty', message));
  $('g-log').replaceChildren();
  $('g-branch').replaceChildren();
  $('g-track').textContent = '';
}

async function showRepos(dir) {
  await loadRepos($('g-repo'), dir);
  for (const o of $('g-repo').options) {
    o.title = o.value;
    o.textContent = o.value.split('/').pop() || o.value;
  }
}

function showGit(g) {
  S.git = g;
  const [branch, track = ''] = g.head.split('...');
  showTracking(track);
  showBranches(branch, g.branches);
  showChanges(g);
  $('g-log').replaceChildren(...logRows(g));
}

export const loadGit = safely(async dir => {
  await showRepos(dir);
  dir ||= $('g-repo').value;
  if (!dir) return $('g-changes').replaceChildren(el('div', 'empty', 'Không tìm thấy repo git nào'));
  if (S.git?.dir !== dir) {
    $('g-changes').replaceChildren(...skel(3));
    $('g-log').replaceChildren(...skel(6));
  }
  let g;
  try {
    g = await api('/api/git?dir=' + encodeURIComponent(dir));
  } catch (e) {
    return showGitError(e.message);
  }
  showGit(g);
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
