import { el } from './dom.mjs';
import { openDiff } from './diff.mjs';
import { t } from './i18n.mjs';
import { icon } from './icons.mjs';
import { openFile } from './viewer.mjs';

export function changedFiles(steps) {
  const byFile = new Map();
  for (const step of steps) {
    if (!step.file) continue;
    const known = byFile.get(step.file);
    byFile.set(step.file, known === 'create' ? 'create' : step.change);
  }
  return [...byFile].map(([file, change]) => ({ file, change }));
}

export function relativeTo(dir, file) {
  const root = dir.endsWith('/') ? dir : `${dir}/`;
  return file.startsWith(root) ? file.slice(root.length) : null;
}

function chip({ file, change }, dir) {
  const name = file.split('/').pop();
  const b = el('button', `fchg ${change}`);
  b.type = 'button';
  b.title = file;
  b.innerHTML = icon(change === 'create' ? 'plus' : 'edit');
  b.append(name);
  const rel = dir ? relativeTo(dir, file) : null;
  b.onclick = e => {
    e.preventDefault();
    if (change === 'create' || !rel) return openFile(file);
    openDiff(name, { dir, file: rel });
  };
  return b;
}

export function fileChips(steps, dir) {
  const files = changedFiles(steps);
  if (!files.length) return null;
  const box = el('div', 'fchips');
  box.append(el('span', null, t('Xem thay đổi:')), ...files.map(f => chip(f, dir)));
  return box;
}
