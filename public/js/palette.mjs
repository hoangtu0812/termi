import { safely } from './api.mjs';
import { $, ago, el } from './dom.mjs';
import { icon } from './icons.mjs';
import { newSession } from './new-session.mjs';
import { S, cur, go } from './state.mjs';
import { THEMES, setTheme } from './theme.mjs';
import { quickStart } from './welcome.mjs';

const fold = t =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
function paletteItems() {
  const x = cur(),
    items = [];
  for (const s of S.list)
    items.push({
      icon: 'term',
      label: s.title || s.name,
      hint: `Phiên · ${s.dir.split('/').pop()}`,
      run: () => go({ s: s.name, t: 'term', d: null, g: null, v: null }),
    });
  const running = new Set(S.list.map(s => s.convId).filter(Boolean));
  for (const p of S.projects || []) {
    const name = p.dir.split('/').pop() || p.dir;
    items.push({
      icon: 'folder',
      label: name,
      hint: 'Phiên mới trong project',
      run: () => quickStart(p.dir, p.conversations[0]?.agent || 'claude'),
    });
    for (const c of p.conversations)
      if (!running.has(c.id))
        items.push({
          icon: 'chat',
          label: c.title,
          hint: `Mở lại hội thoại · ${name} · ${ago(c.mtime)}`,
          run: () => quickStart(p.dir, c.agent, c.id),
        });
  }
  const cmd = (icon, label, run, hint = 'Lệnh') => items.push({ icon, label, hint, run });
  cmd('plus', 'Phiên mới…', newSession);
  if (x)
    for (const [t, n, ic] of [
      ['chat', 'Chat', 'chat'],
      ['term', 'Terminal', 'term'],
      ['files', 'File', 'folder'],
      ['git', 'Git', 'git'],
    ])
      cmd(ic, `Mở tab ${n}`, () => go({ t, v: null }), x.title || x.name);
  cmd('gear', 'Cài đặt', () => $('b-settings').click());
  cmd('bell', 'Thông báo', () => $('b-bell').click());
  for (const [k, [n, ic]] of Object.entries(THEMES)) cmd(ic, `Giao diện: ${n}`, () => setTheme(k));
  return items;
}
function openPalette() {
  if ($('d-cmd').open) return;
  const all = paletteItems(),
    input = $('cmd-q'),
    list = $('cmd-list');
  let shown = [],
    sel = 0;
  const draw = () => {
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    shown = all
      .filter(it => {
        const h = fold(it.label + ' ' + it.hint);
        return words.every(w => h.includes(w));
      })
      .slice(0, 40);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...(shown.length
        ? shown.map((it, i) => {
            const b = el('button', 'cmdi' + (i === sel ? ' on' : ''));
            b.type = 'button';
            b.innerHTML = icon(it.icon);
            const t = el('div');
            t.append(el('b', null, it.label), el('small', null, it.hint));
            b.append(t);
            b.onclick = () => runAt(i);
            return b;
          })
        : [el('div', 'empty', 'Không có gì khớp')]),
    );
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const runAt = i => {
    const it = shown[i];
    if (!it) return;
    $('d-cmd').close();
    safely(async () => it.run())();
  };
  input.value = '';
  sel = 0;
  input.oninput = () => {
    sel = 0;
    draw();
  };
  input.onkeydown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(sel + 1, shown.length - 1);
      draw();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(sel - 1, 0);
      draw();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(sel);
    }
  };
  draw();
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
