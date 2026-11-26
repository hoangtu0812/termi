import { api, safely, toast } from './api.mjs';
import { $, STATE, agentName, ago, dur, el } from './dom.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { renderOthers } from './machines.mjs';
import { openSessionMenu } from './navigation.mjs';
import { seenKeyOf, seenMap } from './seen.mjs';
import { S, go, st } from './state.mjs';
import { store } from './storage.mjs';
import { quickStart, renderRestore, welcome } from './welcome.mjs';

export function stateEl(state, agent, since, model) {
  const e = el('span', 'state st-' + state);
  const live = since && (state === 'working' || state === 'waiting');
  e.append(
    el('span', 'dot'),
    (agent ? agentName(agent) + (model ? ' ' + model : '') + ' · ' : '') +
      (STATE[state] || '') +
      (live ? ' · ' + dur(since) : ''),
  );
  return e;
}
const collapsedSet = () => new Set(JSON.parse(store.get('termi-collapsed') || '[]'));
function toggleProject(dir, open) {
  const c = collapsedSet();
  open ? c.delete(dir) : c.add(dir);
  store.set('termi-collapsed', JSON.stringify([...c]));
  renderSessions();
}
export function renderSessions() {
  const box = $('sessions'),
    sel = st().s;
  const projects = S.projects || [];
  if (!S.list.length && !projects.length) {
    $('sfind').hidden = true;
    welcome(box);
    return renderRestore(box);
  }
  $('sfind').hidden = S.list.length + projects.length < 4;
  const q = $('sq').value.trim().toLowerCase();
  const rank = { waiting: 0, working: 1 };
  const byDir = new Map();
  for (const x of S.list) byDir.set(x.dir, [...(byDir.get(x.dir) || []), x]);
  const pinned = new Set(JSON.parse(store.get('termi-pinned') || '[]'));
  const dirs = [...new Set([...[...byDir.keys()], ...projects.map(p => p.dir)])].sort(
    (a, b) => pinned.has(b) - pinned.has(a),
  );
  const projOf = new Map(projects.map(p => [p.dir, p]));
  const running = new Set(S.list.map(x => x.convId).filter(Boolean));
  const collapsed = collapsedSet(),
    nodes = [];
  for (const dir of dirs) {
    const name = dir.split('/').pop() || dir;
    const sess = (byDir.get(dir) || [])
      .filter(x => !q || (x.name + ' ' + name).toLowerCase().includes(q))
      .sort((a, b) => (rank[a.state] ?? 2) - (rank[b.state] ?? 2) || b.activity - a.activity);
    const convs = (projOf.get(dir)?.conversations || []).filter(
      c => !running.has(c.id) && (!q || (c.title + ' ' + name).toLowerCase().includes(q)),
    );
    if (q && !sess.length && !convs.length && !name.toLowerCase().includes(q)) continue;
    const open = q ? true : byDir.has(dir) ? !collapsed.has(dir) : collapsed.has('+' + dir);
    const h = el('div', 'pj' + (open ? ' open' : '')),
      add = el('button', 'ibtn');
    const t = el('button', 'pjt');
    t.type = 'button';
    t.innerHTML = icon('chevron') + icon('folder');
    t.append(el('span', 'pjn', name));
    if (sess.length) t.append(el('span', 'pjc', String(sess.length)));
    const waiting = sess.some(x => x.state === 'waiting'),
      working = sess.some(x => x.state === 'working');
    if (waiting || working) {
      const d = el('span', 'state st-' + (waiting ? 'waiting' : 'working'));
      d.append(el('span', 'dot'));
      t.append(d);
    }
    t.title = dir;
    t.onclick = () => (byDir.has(dir) ? toggleProject(dir, !open) : toggleProject('+' + dir, open));
    if (pinned.has(dir)) {
      const pin = el('span', 'pin');
      pin.innerHTML = icon('pin');
      t.append(pin);
    }
    t.oncontextmenu = e => {
      e.preventDefault();
      pinned.has(dir) ? pinned.delete(dir) : pinned.add(dir);
      store.set('termi-pinned', JSON.stringify([...pinned]));
      toast(pinned.has(dir) ? `Đã ghim ${name}` : `Bỏ ghim ${name}`);
      renderSessions();
    };
    add.type = 'button';
    add.innerHTML = icon('plus');
    add.title = 'Phiên mới trong thư mục này';
    add.setAttribute('aria-label', `Phiên mới trong ${dir}`);
    add.onclick = safely(() => quickStart(dir, sess.find(x => x.agent)?.agent || convs[0]?.agent || 'claude'));
    h.append(t, add);
    nodes.push(h);
    if (!open) continue;
    nodes.push(...sess.map(sessionRow));
    const more = S.moreConv?.[dir],
      shown = more ? convs : convs.slice(0, 3);
    nodes.push(...shown.map(c => convRow(dir, c)));
    if (convs.length > shown.length) {
      const m = el('button', 'cmore', `Xem thêm ${convs.length - shown.length} hội thoại`);
      m.type = 'button';
      m.onclick = () => {
        S.moreConv = { ...S.moreConv, [dir]: true };
        renderSessions();
      };
      nodes.push(m);
    }
    if (!sess.length && !convs.length) nodes.push(el('div', 'cnone', 'Chưa có phiên hay hội thoại nào'));
  }
  if (!nodes.length) nodes.push(el('div', 'empty', 'Không có gì khớp'));
  box.replaceChildren(...nodes);
  renderRestore(box);
  renderOthers(box);
  function sessionRow(x) {
    const unread = x.replyAt && x.name !== sel && x.replyAt > (seenMap()[seenKeyOf(x.name)] || 0);
    const b = el('button', 'si' + (x.name === sel ? ' cur' : '') + (unread ? ' unread' : ''));
    b.type = 'button';
    if (unread) b.title = 'Có câu trả lời mới chưa xem';
    const top = el('div', 'sit');
    top.append(el('span', 'nm', x.title || x.name), stateEl(x.state, null, x.since));
    if (x.changes) {
      const c = el('span', 'chgs');
      c.innerHTML = icon('git');
      c.append(x.changes);
      c.title = `${x.changes} file chưa commit`;
      top.append(c);
    }
    const body = el('div', 'sib');
    body.append(top);
    const sub = el('div', 'sip');
    if (x.model) sub.append(el('b', 'mdl', x.model));
    if (x.title && x.title !== x.name) sub.append(el('span', 'tmx', x.name));
    if (x.preview) sub.append(x.preview.replace(/\s+/g, ' '));
    if (sub.childNodes.length) body.append(sub);
    b.append(agentAvatar(x.agent, true), body);
    b.onclick = () => go({ s: x.name, t: 'term', d: null, g: null, v: null });
    b.oncontextmenu = e => {
      e.preventDefault();
      openSessionMenu(x.name);
    };
    let sx = null,
      sy = 0;
    b.addEventListener(
      'touchstart',
      e => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      },
      { passive: true },
    );
    b.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx,
        dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (dx < -70 && Math.abs(dy) < 40) {
        e.preventDefault();
        openSessionMenu(x.name);
      }
    });
    return b;
  }
  function convRow(dir, c) {
    const b = el('button', 'ci');
    b.type = 'button';
    const body = el('div', 'sib');
    body.append(el('div', 'cit', c.title), el('div', 'cim', `${agentName(c.agent)} · ${ago(c.mtime)}`));
    b.append(agentAvatar(c.agent, true), body);
    b.title = 'Mở lại hội thoại này';
    b.onclick = safely(() => quickStart(dir, c.agent, c.id));
    return b;
  }
}
export async function loadProjects() {
  const p = await api('/api/projects').catch(() => null);
  if (p) {
    S.projects = p;
    renderSessions();
  }
}
export function setupSessions() {
  $('sq').oninput = renderSessions;
}
