import { api, safely } from './api.mjs';
import { $, el } from './dom.mjs';
import { fileIcon, loadFiles } from './files.mjs';
import { icon } from './icons.mjs';
import { S } from './state.mjs';
import { openFile } from './viewer.mjs';

const SEARCH_DELAY_MS = 250;
let timer;

function resultRow(found) {
  const name = found.rel.split('/').pop();
  const folder = found.rel.slice(0, -name.length - 1);
  const [iconName, color] = fileIcon({ name });
  const b = el('button', 'row');
  b.innerHTML = icon(iconName);
  b.firstChild.style.color = color;
  const label = el('span', 'nm');
  label.append(name, el('small', null, folder ? '  ' + folder : ''));
  b.append(label);
  b.onclick = () => openFile(found.path);
  return b;
}

const search = safely(async () => {
  const term = $('f-q').value.trim();
  if (!term) return loadFiles(S.filesDir);
  const query = `dir=${encodeURIComponent(S.filesDir)}&q=${encodeURIComponent(term)}`;
  const found = await api(`/api/find?${query}`);
  if ($('f-q').value.trim() !== term) return;
  const empty = el('div', 'empty', `Không có file nào tên chứa "${term}"`);
  $('f-list').replaceChildren(...(found.length ? found.map(resultRow) : [empty]));
});

function toggleFind() {
  const box = $('f-findbox');
  box.hidden = !box.hidden;
  if (!box.hidden) return $('f-q').focus();
  $('f-q').value = '';
  loadFiles(S.filesDir);
}

export function setupFileFind() {
  $('f-find').onclick = toggleFind;
  $('f-q').oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(search, SEARCH_DELAY_MS);
  };
}
