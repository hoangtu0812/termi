import { safely } from './api.mjs';
import { $, ago, el } from './dom.mjs';
import { icon } from './icons.mjs';
import { newSession } from './new-session.mjs';
import { S, cur, go } from './state.mjs';
import { THEMES, setTheme } from './theme.mjs';
import { quickStart } from './welcome.mjs';

const MAX_RESULTS = 40;
const TABS = [
  ['chat', 'Chat', 'chat'],
  ['term', 'Terminal', 'term'],
  ['files', 'File', 'folder'],
  ['git', 'Git', 'git'],
];

export const fold = t =>
  String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

export function matchPalette(items, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return items.filter(it => words.every(w => fold(it.label + ' ' + it.hint).includes(w))).slice(0, MAX_RESULTS);
}

const sessionItems = () =>
  S.list.map(s => ({
    icon: 'term',
    label: s.title || s.name,
    hint: `Phiên · ${s.dir.split('/').pop()}`,
    run: () => go({ s: s.name, t: 'term', d: null, g: null, v: null }),
  }));

function projectItems() {
  const items = [];
  const running = new Set(S.list.map(s => s.convId).filter(Boolean));
  for (const p of S.projects || []) {
    const name = p.dir.split('/').pop() || p.dir;
    const run = () => quickStart(p.dir, p.conversations[0]?.agent || 'claude');
    items.push({ icon: 'folder', label: name, hint: 'Phiên mới trong project', run });
    for (const c of p.conversations.filter(c => !running.has(c.id))) {
      const hint = `Mở lại hội thoại · ${name} · ${ago(c.mtime)}`;
      items.push({ icon: 'chat', label: c.title, hint, run: () => quickStart(p.dir, c.agent, c.id) });
    }
  }
  return items;
}

function commandItems() {
  const x = cur();
  const items = [];
  const cmd = (iconName, label, run, hint = 'Lệnh') => items.push({ icon: iconName, label, hint, run });
  cmd('plus', 'Phiên mới…', newSession);
  if (x) for (const [t, n, ic] of TABS) cmd(ic, `Mở tab ${n}`, () => go({ t, v: null }), x.title || x.name);
  cmd('gear', 'Cài đặt', () => $('b-settings').click());
  cmd('bell', 'Thông báo', () => $('b-bell').click());
  for (const [k, [n, ic]] of Object.entries(THEMES)) cmd(ic, `Giao diện: ${n}`, () => setTheme(k));
  return items;
}

const paletteItems = () => [...sessionItems(), ...projectItems(), ...commandItems()];

function paletteRow(it, i, palette) {
  const b = el('button', 'cmdi' + (i === palette.sel ? ' on' : ''));
  b.type = 'button';
  b.innerHTML = icon(it.icon);
  const t = el('div');
  t.append(el('b', null, it.label), el('small', null, it.hint));
  b.append(t);
  b.onclick = () => runAt(palette, i);
  return b;
}

function drawPalette(palette) {
  const list = $('cmd-list');
  palette.shown = matchPalette(palette.all, $('cmd-q').value);
  palette.sel = Math.min(palette.sel, Math.max(0, palette.shown.length - 1));
  const rows = palette.shown.map((it, i) => paletteRow(it, i, palette));
  list.replaceChildren(...(rows.length ? rows : [el('div', 'empty', 'Không có gì khớp')]));
  list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}

function runAt(palette, i) {
  const it = palette.shown[i];
  if (!it) return;
  $('d-cmd').close();
  safely(async () => it.run())();
}

function onPaletteKey(palette, e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    palette.sel = Math.min(palette.sel + 1, palette.shown.length - 1);
    drawPalette(palette);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    palette.sel = Math.max(palette.sel - 1, 0);
    drawPalette(palette);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    runAt(palette, palette.sel);
  }
}

function openPalette() {
  if ($('d-cmd').open) return;
  const palette = { all: paletteItems(), shown: [], sel: 0 };
  const input = $('cmd-q');
  input.value = '';
  input.oninput = () => {
    palette.sel = 0;
    drawPalette(palette);
  };
  input.onkeydown = e => onPaletteKey(palette, e);
  drawPalette(palette);
  $('d-cmd').showModal();
  input.focus();
}
export const paletteKey = e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    e.stopPropagation();
    openPalette();
  }
};
export function setupPalette() {
  document.addEventListener('keydown', paletteKey, true);
}
