import { api, safely } from './api.mjs';
import { $, agentName, ago, el, short, skel } from './dom.mjs';
import { agentAvatar } from './icons.mjs';
import { cur } from './state.mjs';
import { t } from './i18n.mjs';
import { openConversation, resumeConversation } from './conversation.mjs';

const SEARCH_DELAY_MS = 300;
const MIN_QUERY_CHARS = 2;
let scope = null;
let timer;

function row(h) {
  const b = el('button');
  b.type = 'button';
  const t2 = el('span', 't2');
  t2.append(agentAvatar(h.agent, true), `${agentName(h.agent)} · ${short(h.cwd)} · ${ago(h.mtime)}`);
  const view = el('span', 'hview', t('Xem'));
  view.setAttribute('role', 'button');
  view.onclick = e => {
    e.stopPropagation();
    $('d-hist').close();
    openConversation(h.id);
  };
  b.append(el('span', 't1', h.title), ...(h.snippet ? [el('span', 'hsnip', h.snippet)] : []), t2, view);
  b.onclick = async () => {
    if (await resumeConversation(h)) $('d-hist').close();
  };
  return b;
}

function emptyText(query) {
  if (query) return t('Không tìm thấy hội thoại nào có "{0}"', query);
  return scope ? t('Chưa có hội thoại nào ở {0}', short(scope)) : t('Không có hội thoại nào');
}

function allFoldersButton() {
  const b = el('button', 'btn', t('Xem mọi thư mục'));
  b.type = 'button';
  b.onclick = () => showHistory(true);
  return b;
}

const load = safely(async () => {
  const typed = $('hist-q').value.trim();
  const query = typed.length >= MIN_QUERY_CHARS ? typed : '';
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (scope) params.set('dir', scope);
  if (query) $('hist-list').replaceChildren(el('div', 'empty', t('Đang tìm "{0}"…', query)));
  const list = await api(`api/history${query ? '/search' : ''}?${params}`);
  if ($('hist-q').value.trim() !== typed) return;
  const rows = list.length ? list.map(row) : [el('div', 'empty', emptyText(query))];
  $('hist-list').replaceChildren(...rows, ...(scope ? [allFoldersButton()] : []));
});

function showHistory(all) {
  scope = all ? null : cur()?.dir || null;
  if (!all) $('hist-q').value = '';
  $('hist-list').replaceChildren(...skel(5));
  if (!$('d-hist').open) $('d-hist').showModal();
  load();
}

export function setupHistory() {
  $('b-hist').onclick = () => showHistory(false);
  $('hist-q').oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(load, SEARCH_DELAY_MS);
  };
  $('hist-q').onkeydown = e => {
    if (e.key === 'Enter') e.preventDefault();
  };
}
