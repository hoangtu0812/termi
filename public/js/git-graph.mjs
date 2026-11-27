import { openDiff } from './diff.mjs';
import { ago, el } from './dom.mjs';

const HEAD_RING = ' stroke="var(--bg)" stroke-width="2"';
const LANE_COLORS = ['#e07a55', '#4fbf7f', '#6aa7ff', '#e8b339', '#c678dd', '#56b6c2', '#ef6b73', '#98c379'];
const LW = 14;
const PAD = 12;
const RH = 56;
const MAX_LANES = 10;

const DAY_ROW_HEIGHT = 28;
const HUE_STEPS = 360;
const HASH_MULTIPLIER = 31;

const laneX = lane => PAD + lane * LW;
const graphWidth = width => PAD * 2 + (Math.min(width, MAX_LANES) - 1) * LW;
const ROW_Y = [0, RH / 2, RH];

function segmentPath([a, ya, b, yb]) {
  const x1 = laneX(a);
  const y1 = ROW_Y[ya];
  const x2 = laneX(b);
  const y2 = ROW_Y[yb];
  const ym = (y1 + y2) / 2;
  const color = LANE_COLORS[(ya === 0 && yb === 1 ? a : b) % LANE_COLORS.length];
  const d = x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`;
  return `<path d="${d}" stroke="${color}" stroke-width="2" fill="none"/>`;
}

function commitDot(c, row, isHead) {
  const color = LANE_COLORS[row.col % LANE_COLORS.length];
  const cx = laneX(row.col);
  if (c.p.length > 1)
    return `<circle cx="${cx}" cy="${RH / 2}" r="5" fill="var(--bg)" stroke="${color}" stroke-width="2.5"/>`;
  return `<circle cx="${cx}" cy="${RH / 2}" r="${isHead ? 6 : 4.5}" fill="${color}"${isHead ? HEAD_RING : ''}/>`;
}

export function passingLanesSvg(row, width) {
  const lanes = [...new Set(row.seg.filter(([, top]) => top === 0).map(([lane]) => lane))];
  const lines = lanes.map(lane => {
    const color = LANE_COLORS[lane % LANE_COLORS.length];
    return `<path d="M${laneX(lane)} 0V${DAY_ROW_HEIGHT}" stroke="${color}" stroke-width="2"/>`;
  });
  return `<svg width="${graphWidth(width)}" height="${DAY_ROW_HEIGHT}" aria-hidden="true">${lines.join('')}</svg>`;
}

export function authorHue(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * HASH_MULTIPLIER + ch.codePointAt(0)) >>> 0;
  return hash % HUE_STEPS;
}

function authorAvatar(name) {
  const a = el('span', 'aav', (name.trim()[0] || '?').toUpperCase());
  a.style.background = `hsl(${authorHue(name)} 55% 45%)`;
  a.title = name;
  return a;
}

export function graphSvg(c, row, width) {
  const w = graphWidth(width);
  const isHead = c.refs.some(r => r.startsWith('HEAD'));
  const shapes = row.seg.map(segmentPath).join('') + commitDot(c, row, isHead);
  return `<svg width="${w}" height="${RH}" viewBox="0 0 ${w} ${RH}" aria-hidden="true">${shapes}</svg>`;
}

function refKind(ref, name) {
  if (ref.startsWith('HEAD -> ')) return 'head';
  if (ref.startsWith('tag: ')) return 'tag';
  return name.includes('/') ? 'rm' : 'br';
}

function commitMeta(c) {
  const meta = el('div', 'cm-meta');
  for (const ref of c.refs) {
    const name = ref.replace(/^HEAD -> /, '').replace(/^tag: /, '');
    if (ref === 'HEAD' || name.endsWith('/HEAD')) continue;
    meta.append(el('span', 'pill ' + refKind(ref, name), name));
  }
  meta.append(authorAvatar(c.a), el('span', 'h', c.h.slice(0, 7)), `${c.a} · ${ago(c.t)}`);
  return meta;
}

export function commitRow(c, row, width, dir) {
  const isHead = c.refs.some(r => r.startsWith('HEAD'));
  const r = el('div', 'cm' + (isHead ? ' head' : ''));
  r.insertAdjacentHTML('afterbegin', graphSvg(c, row, width));
  const body = el('div', 'cm-body');
  body.append(el('div', 'cm-msg', c.s), commitMeta(c));
  r.append(body);
  r.title = c.s;
  r.onclick = () => openDiff(c.h.slice(0, 7), { dir, rev: c.h });
  return r;
}
