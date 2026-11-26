import { openDiff } from './diff.mjs';
import { ago, el } from './dom.mjs';

const HEAD_RING = ' stroke="var(--bg)" stroke-width="2"';
const LANE_COLORS = ['#e07a55', '#4fbf7f', '#6aa7ff', '#e8b339', '#c678dd', '#56b6c2', '#ef6b73', '#98c379'];
const LW = 14,
  PAD = 12,
  RH = 56,
  MAX_LANES = 10;
export function commitRow(c, row, width, dir) {
  const lanes = Math.min(width, MAX_LANES),
    W = PAD * 2 + (lanes - 1) * LW;
  const X = l => PAD + l * LW,
    Y = [0, RH / 2, RH];
  const isHead = c.refs.some(r => r.startsWith('HEAD'));
  let svg = '';
  for (const [a, ya, b, yb] of row.seg) {
    const x1 = X(a),
      y1 = Y[ya],
      x2 = X(b),
      y2 = Y[yb],
      ym = (y1 + y2) / 2;
    const color = LANE_COLORS[(ya === 0 && yb === 1 ? a : b) % LANE_COLORS.length];
    const d = x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`;
    svg += `<path d="${d}" stroke="${color}" stroke-width="2" fill="none"/>`;
  }
  const color = LANE_COLORS[row.col % LANE_COLORS.length],
    cx = X(row.col);
  svg +=
    c.p.length > 1
      ? `<circle cx="${cx}" cy="${RH / 2}" r="5" fill="var(--bg)" stroke="${color}" stroke-width="2.5"/>`
      : `<circle cx="${cx}" cy="${RH / 2}" r="${isHead ? 6 : 4.5}" fill="${color}"${isHead ? HEAD_RING : ''}/>`;
  const r = el('div', 'cm' + (isHead ? ' head' : ''));
  r.insertAdjacentHTML(
    'afterbegin',
    `<svg width="${W}" height="${RH}" viewBox="0 0 ${W} ${RH}" aria-hidden="true">${svg}</svg>`,
  );
  const body = el('div', 'cm-body'),
    meta = el('div', 'cm-meta');
  for (const ref of c.refs) {
    const name = ref.replace(/^HEAD -> /, '').replace(/^tag: /, '');
    if (ref === 'HEAD' || name.endsWith('/HEAD')) continue;
    meta.append(
      el(
        'span',
        'pill ' +
          (ref.startsWith('HEAD -> ') ? 'head' : ref.startsWith('tag: ') ? 'tag' : name.includes('/') ? 'rm' : 'br'),
        name,
      ),
    );
  }
  meta.append(el('span', 'h', c.h.slice(0, 7)), `${c.a} · ${ago(c.t)}`);
  body.append(el('div', 'cm-msg', c.s), meta);
  r.append(body);
  r.title = c.s;
  r.onclick = () => openDiff(c.h.slice(0, 7), { dir, rev: c.h });
  return r;
}
