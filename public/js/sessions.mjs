import { api, safely, toast } from './api.mjs';
import { $, STATE, agentName, ago, dur, el } from './dom.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { renderOthers } from './machines.mjs';
import { openSessionMenu } from './navigation.mjs';
import { seenKeyOf, seenMap } from './seen.mjs';
import { sessionActions } from './session-actions.mjs';
import { renderFilter } from './session-filter.mjs';
import { matchesFilter, sessionLabel } from './session-label.mjs';
import { S, go, st } from './state.mjs';
import { store } from './storage.mjs';
import { welcome } from './home.mjs';
import { quickStart, renderRestore } from './welcome.mjs';
import { t } from './i18n.mjs';
import { sessionTab } from './tab-memory.mjs';

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
const STATE_RANK = { waiting: 0, working: 1 };
const SWIPE_DISTANCE = 70;
const SWIPE_TOLERANCE = 40;
const FIRST_CONVERSATIONS = 3;

const byStateThenActivity = (a, b) =>
  (STATE_RANK[a.state] ?? 2) - (STATE_RANK[b.state] ?? 2) || b.activity - a.activity;

function onSwipeLeft(target, action) {
  let startX = null;
  let startY = 0;
  const start = e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  };
  target.addEventListener('touchstart', start, { passive: true });
  target.addEventListener('touchend', e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    startX = null;
    if (dx < -SWIPE_DISTANCE && Math.abs(dy) < SWIPE_TOLERANCE) {
      e.preventDefault();
      action();
    }
  });
}

function sessionSummary(x) {
  const top = el('div', 'sit');
  const name = el('span', 'nm', sessionLabel(x));
  name.title = x.title || x.name;
  top.append(name, stateEl(x.state, null, x.since));
  if (x.changes) {
    const c = el('span', 'chgs');
    c.innerHTML = icon('git');
    c.append(x.changes);
    c.title = t('{0} file chưa commit', x.changes);
    top.append(c);
  }
  const body = el('div', 'sib');
  body.append(top);
  const sub = el('div', 'sip');
  if (x.model) sub.append(el('b', 'mdl', x.model));
  if (x.title && x.title !== x.name) sub.append(el('span', 'tmx', x.name));
  if (x.preview) sub.append(x.preview.replace(/\s+/g, ' '));
  if (sub.childNodes.length) body.append(sub);
  return body;
}

function sessionRow(x, selected) {
  const unread = x.replyAt && x.name !== selected && x.replyAt > (seenMap()[seenKeyOf(x.name)] || 0);
  const b = el('button', 'si' + (x.name === selected ? ' cur' : '') + (unread ? ' unread' : ''));
  b.type = 'button';
  if (unread) b.title = t('Có câu trả lời mới chưa xem');
  b.append(agentAvatar(x.agent, true), sessionSummary(x), sessionActions(x.name));
  b.onclick = () => go({ s: x.name, t: sessionTab(x.name), d: null, g: null, v: null });
  b.oncontextmenu = e => {
    e.preventDefault();
    openSessionMenu(x.name);
  };
  onSwipeLeft(b, () => openSessionMenu(x.name));
  return b;
}

function convRow(dir, c) {
  const b = el('button', 'ci');
  b.type = 'button';
  const body = el('div', 'sib');
  body.append(el('div', 'cit', c.title), el('div', 'cim', `${agentName(c.agent)} · ${ago(c.mtime)}`));
  b.append(agentAvatar(c.agent, true), body);
  b.title = t('Mở lại hội thoại này');
  b.onclick = safely(() => quickStart(dir, c.agent, c.id));
  return b;
}

function togglePin(view, dir, name) {
  const { pinned } = view;
  if (pinned.has(dir)) pinned.delete(dir);
  else pinned.add(dir);
  store.set('termi-pinned', JSON.stringify([...pinned]));
  toast(pinned.has(dir) ? t('Đã ghim {0}', name) : t('Bỏ ghim {0}', name));
  renderSessions();
}

function projectTitle(view, project) {
  const { dir, name, sessions, open } = project;
  const node = el('button', 'pjt');
  node.type = 'button';
  node.innerHTML = icon('chevron') + icon('folder');
  node.append(el('span', 'pjn', name));
  if (sessions.length) node.append(el('span', 'pjc', String(sessions.length)));
  const waiting = sessions.some(x => x.state === 'waiting');
  const working = sessions.some(x => x.state === 'working');
  if (waiting || working) {
    const d = el('span', 'state st-' + (waiting ? 'waiting' : 'working'));
    d.append(el('span', 'dot'));
    node.append(d);
  }
  node.title = dir;
  node.onclick = () => (view.byDir.has(dir) ? toggleProject(dir, !open) : toggleProject('+' + dir, open));
  if (view.pinned.has(dir)) {
    const pin = el('span', 'pin');
    pin.innerHTML = icon('pin');
    node.append(pin);
  }
  node.oncontextmenu = e => {
    e.preventDefault();
    togglePin(view, dir, name);
  };
  return node;
}

function projectHeader(view, project) {
  const { dir, sessions, conversations, open } = project;
  const h = el('div', 'pj' + (open ? ' open' : ''));
  const add = el('button', 'ibtn');
  add.type = 'button';
  add.innerHTML = icon('plus');
  add.title = t('Phiên mới trong thư mục này');
  add.setAttribute('aria-label', t('Phiên mới trong {0}', dir));
  const agent = sessions.find(x => x.agent)?.agent || conversations[0]?.agent || 'claude';
  add.onclick = safely(() => quickStart(dir, agent));
  h.append(projectTitle(view, project), add);
  return h;
}

function conversationNodes(dir, conversations) {
  const more = S.moreConv?.[dir];
  const shown = more ? conversations : conversations.slice(0, FIRST_CONVERSATIONS);
  const nodes = shown.map(c => convRow(dir, c));
  if (conversations.length > shown.length) {
    const m = el('button', 'cmore', t('Xem thêm {0} hội thoại', conversations.length - shown.length));
    m.type = 'button';
    m.onclick = () => {
      S.moreConv = { ...S.moreConv, [dir]: true };
      renderSessions();
    };
    nodes.push(m);
  }
  return nodes;
}

function sessionsView(filter) {
  const projects = filter === 'all' ? S.projects || [] : [];
  const byDir = new Map();
  for (const x of S.list.filter(s => matchesFilter(s, filter))) byDir.set(x.dir, [...(byDir.get(x.dir) || []), x]);
  const pinned = new Set(JSON.parse(store.get('termi-pinned') || '[]'));
  const dirs = [...new Set([...byDir.keys(), ...projects.map(p => p.dir)])].sort(
    (a, b) => pinned.has(b) - pinned.has(a),
  );
  return {
    selected: st().s,
    query: $('sq').value.trim().toLowerCase(),
    byDir,
    pinned,
    dirs,
    projectOf: new Map(projects.map(p => [p.dir, p])),
    running: new Set(S.list.map(x => x.convId).filter(Boolean)),
    collapsed: collapsedSet(),
  };
}

function describeProject(view, dir) {
  const { query: q } = view;
  const name = dir.split('/').pop() || dir;
  const sessions = (view.byDir.get(dir) || [])
    .filter(x => !q || (x.name + ' ' + name).toLowerCase().includes(q))
    .sort(byStateThenActivity);
  const conversations = (view.projectOf.get(dir)?.conversations || []).filter(
    c => !view.running.has(c.id) && (!q || (c.title + ' ' + name).toLowerCase().includes(q)),
  );
  if (q && !sessions.length && !conversations.length && !name.toLowerCase().includes(q)) return null;
  const open = q ? true : view.byDir.has(dir) ? !view.collapsed.has(dir) : view.collapsed.has('+' + dir);
  return { dir, name, sessions, conversations, open };
}

function projectNodes(view, project) {
  const nodes = [projectHeader(view, project)];
  if (!project.open) return nodes;
  nodes.push(...project.sessions.map(x => sessionRow(x, view.selected)));
  nodes.push(...conversationNodes(project.dir, project.conversations));
  if (!project.sessions.length && !project.conversations.length) {
    nodes.push(el('div', 'cnone', t('Chưa có phiên hay hội thoại nào')));
  }
  return nodes;
}

export function renderSessions() {
  const box = $('sessions');
  const projects = S.projects || [];
  if (!S.list.length && !projects.length) {
    $('sfind').hidden = true;
    $('sfilt').hidden = true;
    welcome(box);
    return renderRestore(box);
  }
  $('sfind').hidden = S.list.length + projects.length < 4;
  const view = sessionsView(renderFilter(renderSessions));
  const nodes = view.dirs
    .map(dir => describeProject(view, dir))
    .filter(Boolean)
    .flatMap(p => projectNodes(view, p));
  if (!nodes.length) nodes.push(el('div', 'empty', t('Không có gì khớp')));
  box.replaceChildren(...nodes);
  renderRestore(box);
  renderOthers(box);
}
export async function loadProjects() {
  const p = await api('api/projects').catch(() => null);
  if (p) {
    S.projects = p;
    renderSessions();
  }
}
export function setupSessions() {
  $('sq').oninput = renderSessions;
}
