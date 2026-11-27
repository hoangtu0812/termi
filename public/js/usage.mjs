import { api } from './api.mjs';
import { $, agentName, el, short } from './dom.mjs';
import { icon } from './icons.mjs';
import { loadMachines } from './machines.mjs';
import { S, st } from './state.mjs';

const level = p => (p >= 90 ? 'bad' : p >= 70 ? 'warn' : '');
const kTok = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1e3) + 'k');
const windowName = m =>
  ({ 300: '5 giờ', 10080: '7 ngày', 43200: '30 ngày' })[m] || (m ? `${Math.round(m / 60)} giờ` : '');
const until = t => {
  const m = Math.round((t - Date.now()) / 60000);
  return m <= 0
    ? 'sắp reset'
    : m < 60
      ? `reset sau ${m} phút`
      : m < 1440
        ? `reset sau ${Math.floor(m / 60)} giờ ${m % 60} phút`
        : `reset ${new Date(t).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' })}`;
};
function limitRows(agent, l) {
  if (agent === 'claude' && l.claude)
    return [
      ['5h', 'Phiên 5 giờ', l.claude.fiveHour],
      ['7d', '7 ngày', l.claude.sevenDay],
    ]
      .filter(r => r[2])
      .map(([s, n, w]) => [s, n, w.pct, w.resetsAt]);
  if (agent === 'codex' && l.codex)
    return [l.codex.primary, l.codex.secondary]
      .filter(Boolean)
      .map(w => [
        windowName(w.minutes).replace(' giờ', 'h').replace(' ngày', 'd'),
        windowName(w.minutes),
        w.pct,
        w.resetsAt,
      ]);
  return [];
}
function renderUsageChip() {
  const u = S.usage,
    b = $('b-usage');
  if (!u) return (b.hidden = true);
  const agent = u.session?.agent,
    lim = limitRows(agent, u.limits)[0];
  const ctx = u.session?.context;
  const [label, pct, text] = lim
    ? [lim[0], lim[2]]
    : u.session?.pct != null
      ? ['ctx', Math.round(u.session.pct)]
      : ctx
        ? ['ctx', 0, kTok(ctx)]
        : ['CPU', u.machine.cpu];
  b.className = 'uchip ' + level(pct);
  b.replaceChildren(el('i'), `${label} ${text ?? pct + '%'}`);
  b.title = 'Usage: hạn mức, token, tài nguyên máy';
  b.hidden = false;
}
const ICON_COLOR = { claude: 'var(--acc)', codex: 'var(--blue)', ctx: '#a78bfa', machine: 'var(--ok)' };
function meterRow(name, pct, note, ic, color) {
  const r = el('div', 'urow'),
    top = el('div', 'top'),
    m = el('div', 'meter ' + level(pct ?? 0)),
    bar = el('span');
  if (ic) {
    const i = el('span', 'ic');
    i.style.color = color;
    i.innerHTML = icon(ic);
    r.append(i);
  }
  top.append(el('b', null, name), el('span', null, pct == null ? '—' : pct + '%'));
  bar.style.width = Math.min(100, pct ?? 0) + '%';
  m.append(bar);
  r.append(top, m);
  if (note) r.append(el('small', null, note));
  return r;
}
export function group(title, ic, rows) {
  const g = el('div', 'ugrp'),
    h = el('h4');
  h.innerHTML = icon(ic);
  h.append(title);
  g.append(h, ...rows);
  return g;
}
const LIMIT_AGENTS = ['claude', 'codex'];
const GIB = 2 ** 30;
const NO_CLAUDE_LIMITS =
  'Claude: chưa có số liệu. Cần cài statusline của termi (xem README); chỉ gói Pro/Max/Ultra có hạn mức này.';

function planLimitRows(limits) {
  const rows = [];
  for (const agent of LIMIT_AGENTS) {
    const limitsOfAgent = limitRows(agent, limits);
    for (const [short, name, pct, resetAt] of limitsOfAgent) {
      const ic = /d$/.test(short) ? 'calendar' : 'clock';
      rows.push(meterRow(`${agentName(agent)} · ${name}`, pct, until(resetAt), ic, ICON_COLOR[agent]));
    }
    if (!limitsOfAgent.length && agent === 'claude') rows.push(el('div', 'uempty', NO_CLAUDE_LIMITS));
  }
  return rows;
}

export function contextPercent(session) {
  if (session.pct != null) return Math.round(session.pct);
  return session.window ? Math.round((session.context / session.window) * 100) : null;
}

function sessionGroup(session) {
  const title = `Phiên ${session.name} · ${agentName(session.agent)}`;
  if (session.context == null)
    return group(title, 'term', [el('div', 'uempty', 'Chưa có số liệu token cho phiên này')]);
  const total = session.window ? ' / ' + kTok(session.window) : '';
  const detail = `${kTok(session.context)}${total} token${session.model ? ' · ' + session.model : ''}`;
  return group(title, 'term', [meterRow('Ngữ cảnh', contextPercent(session), detail, 'layers', ICON_COLOR.ctx)]);
}

function machineGroup(m) {
  const ram = m.memTotal ? `${Math.round(m.memTotal / GIB)} GB` : '';
  const free = m.diskFree != null ? `còn trống ${(m.diskFree / GIB).toFixed(0)} GB` : '';
  return group('Máy' + (st().m ? ' · ' + st().m : ''), 'monitor', [
    meterRow('CPU (tải 1 phút)', m.cpu, '', 'cpu', ICON_COLOR.machine),
    meterRow('RAM', m.mem, ram, 'ram', ICON_COLOR.machine),
    meterRow('Ổ đĩa', m.disk, free, 'disk', ICON_COLOR.machine),
  ]);
}

function renderUsageDialog() {
  const u = S.usage;
  if (!u) return;
  const parts = [group('Hạn mức gói', 'gauge', planLimitRows(u.limits))];
  if (u.session?.agent) parts.push(sessionGroup(u.session));
  parts.push(machineGroup(u.machine));
  $('usage-body').replaceChildren(...parts);
}
async function loadUsage() {
  S.usage = await api('/api/usage?session=' + encodeURIComponent(st().s || '')).catch(() => null);
  renderUsageChip();
  if ($('d-usage').open) renderUsageDialog();
}
export function setupUsage() {
  $('b-usage').onclick = () => {
    renderUsageDialog();
    $('d-usage').showModal();
    loadUsage();
  };
  setInterval(() => document.visibilityState === 'visible' && loadUsage(), 30_000);
  addEventListener('hashchange', () => {
    if (st().s !== S.usage?.session?.name) loadUsage();
  });
  loadUsage();
  setInterval(() => document.visibilityState === 'visible' && loadMachines(), 60_000);
}
