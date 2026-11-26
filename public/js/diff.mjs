import { api, safely } from './api.mjs';
import { ago, el, ltr, wide } from './dom.mjs';
import { openViewer } from './viewer.mjs';

function diffNode(text) {
  const pre = el('pre', 'diff');
  pre.append(
    ...text.split('\n').map(l => {
      const sp = el(
        'span',
        /^(diff |\+\+\+ |--- |index )/.test(l)
          ? 'f'
          : l.startsWith('@@')
            ? 'hk'
            : l[0] === '+'
              ? 'a'
              : l[0] === '-'
                ? 'd'
                : '',
        l + '\n',
      );
      if (l.startsWith('diff --git ')) sp.dataset.file = l.slice(l.lastIndexOf(' b/') + 3);
      return sp;
    }),
  );
  return pre;
}
function plusMinusBar(add, del) {
  const bar = el('span', 'pmbar'),
    total = add + del,
    a = total ? Math.round((add / total) * 5) : 0;
  for (let i = 0; i < 5; i++) bar.append(el('i', i < a ? 'a' : i < (total ? 5 : 0) ? 'd' : ''));
  return bar;
}
export const openDiff = safely(async (title, qs) => {
  const r = await api('/api/show?' + new URLSearchParams(qs));
  if (wide()) openViewer(title, diffBox(r, true), null, ['Một cột', diffBox(r, false), 'Hai cột']);
  else openViewer(title, diffBox(r, false));
});
function diffBox(r, split) {
  const box = el('div', 'dv'),
    diff = split ? diffSplitNode(r.text) : diffNode(r.text);
  if (r.commit) {
    const h = el('div', 'chead');
    h.append(el('b', null, r.commit.subject));
    if (r.commit.body) h.append(el('p', null, r.commit.body.replace(/([^\n])\n(?![\n\-*•]|\s*$)\s*/g, '$1 ')));
    h.append(el('small', null, `${r.commit.hash.slice(0, 7)} · ${r.commit.author} · ${ago(r.commit.t)}`));
    box.append(h);
  }
  if (r.files?.length) {
    const add = r.files.reduce((n, f) => n + (f.add || 0), 0),
      del = r.files.reduce((n, f) => n + (f.del || 0), 0);
    const sum = el('div', 'fsum');
    sum.append(`${r.files.length} file`, el('span', 'pa', ` +${add}`), el('span', 'pd', ` −${del}`));
    box.append(
      sum,
      ...r.files.map(f => {
        const row = el('button', 'frow');
        row.type = 'button';
        const p = el('span', 'p', ltr(f.path));
        p.title = f.path;
        row.append(p);
        if (f.add == null) row.append(el('span', 'pm', 'nhị phân'));
        else row.append(el('span', 'pm pa', `+${f.add}`), el('span', 'pm pd', `−${f.del}`), plusMinusBar(f.add, f.del));
        row.onclick = () =>
          diff.querySelector(`[data-file="${CSS.escape(f.path)}"]`)?.scrollIntoView({ block: 'start' });
        return row;
      }),
    );
  }
  box.append(diff);
  return box;
}
function diffSplitNode(text) {
  const box = el('div', 'dsplit'),
    rows = [];
  let dels = [],
    adds = [];
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) rows.push(['chg', dels[i] ?? null, adds[i] ?? null]);
    dels = [];
    adds = [];
  };
  for (const l of text.split('\n')) {
    if (l.startsWith('diff --git ')) {
      flush();
      rows.push(['file', l.slice(l.lastIndexOf(' b/') + 3)]);
    } else if (/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|Binary)/.test(l))
      flush();
    else if (l.startsWith('@@')) {
      flush();
      rows.push(['hunk', l]);
    } else if (l[0] === '-') dels.push(l.slice(1));
    else if (l[0] === '+') adds.push(l.slice(1));
    else {
      flush();
      rows.push(['ctx', l.slice(1), l.slice(1)]);
    }
  }
  flush();
  box.append(
    ...rows.map(([kind, a, b]) => {
      if (kind === 'file') {
        const d = el('div', 'ds-file', a);
        d.dataset.file = a;
        return d;
      }
      if (kind === 'hunk') return el('div', 'ds-hunk', a);
      const row = el('div', 'ds-row');
      const cell = (v, cls) =>
        el('div', 'ds-cell' + (v === null ? ' empty' : kind === 'chg' ? ' ' + cls : ''), v ?? '');
      row.append(cell(a, 'd'), cell(b, 'a'));
      return row;
    }),
  );
  return box;
}
