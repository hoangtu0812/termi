import { api, safely } from './api.mjs';
import { ago, el, ltr, short } from './dom.mjs';
import { t } from './i18n.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { newSession } from './new-session.mjs';
import { stateEl } from './sessions.mjs';
import { S, go } from './state.mjs';
import { store } from './storage.mjs';
import { sessionTab } from './tab-memory.mjs';
import { firstRunTips } from './tips.mjs';
import { quickStart } from './welcome.mjs';

const RECENT_PROJECTS = 5;
const GREETINGS = [
  [11, () => t('Chào buổi sáng')],
  [14, () => t('Chào buổi trưa')],
  [18, () => t('Chào buổi chiều')],
  [24, () => t('Chào buổi tối')],
];

export const greeting = (hour = new Date().getHours()) => GREETINGS.find(([until]) => hour < until)[1]();

export const latestSession = list => [...list].sort((a, b) => b.activity - a.activity)[0] ?? null;

function hero() {
  const h = el('div', 'hhero');
  h.innerHTML = '<img src="icon.svg" alt="">';
  const intro = S.list.length
    ? t('Chọn một phiên bên trái, hoặc bắt đầu làm việc ở một project gần đây.')
    : t('Chọn project và agent để bắt đầu. Phiên chạy trong tmux trên máy, đóng app hay mất mạng vẫn còn nguyên.');
  h.append(el('h2', null, greeting()), el('p', null, intro));
  return h;
}

function continueRow(session) {
  const b = el('button', 'hrow hcont');
  b.type = 'button';
  const text = el('div', 'htx');
  text.append(el('b', null, session.title || session.name), stateEl(session.state, session.agent, session.since));
  const go2 = el('span', 'hgo');
  go2.innerHTML = icon('send');
  b.append(agentAvatar(session.agent, true), text, go2);
  b.onclick = () => go({ s: session.name, t: sessionTab(session.name), d: null, g: null, v: null });
  return b;
}

function agentChip(dir, agent) {
  const b = el('button', 'hag');
  b.type = 'button';
  b.title = t('Phiên mới trong {0}', dir.split('/').pop());
  b.append(agentAvatar(agent.id, true));
  b.onclick = safely(() => quickStart(dir, agent.id));
  return b;
}

function resumeChip(dir, last) {
  const b = el('button', 'hag');
  b.type = 'button';
  b.title = `${t('Mở lại hội thoại này')}: ${last.title}`;
  b.innerHTML = icon('refresh');
  b.onclick = safely(() => quickStart(dir, last.agent, last.id));
  return b;
}

function projectRow(dir, project, agents) {
  const row = el('div', 'hrow');
  row.innerHTML = icon('folder');
  const text = el('div', 'htx');
  text.append(el('b', null, dir.split('/').pop() || dir), el('small', null, ltr(short(dir))));
  const meta = el('span', 'hago', project?.last ? ago(project.last) : '');
  const chips = el('div', 'hchips');
  const last = project?.conversations?.[0];
  if (last && !S.list.some(x => x.convId === last.id)) chips.append(resumeChip(dir, last));
  chips.append(...agents.map(agent => agentChip(dir, agent)));
  row.append(text, meta, chips);
  return row;
}

function cardFoot() {
  const foot = el('div', 'hfoot');
  const other = el('button', 'btn');
  other.type = 'button';
  other.innerHTML = icon('folder') + t('Thư mục khác…');
  other.onclick = newSession;
  const create = el('button', 'btn pri');
  create.type = 'button';
  create.innerHTML = icon('plus') + t('Phiên mới');
  create.onclick = newSession;
  foot.append(other, create);
  return foot;
}

async function projectRows() {
  const [dirs, agents] = await Promise.all([
    api('api/dirs').catch(() => ({ recent: [] })),
    api('api/agents').catch(() => []),
  ]);
  const projects = new Map((S.projects || []).map(p => [p.dir, p]));
  const rows = dirs.recent.slice(0, RECENT_PROJECTS).map(dir => projectRow(dir, projects.get(dir), agents));
  return rows.length ? rows : [el('div', 'empty', t('Chưa có project nào, bấm "Thư mục khác…" để chọn'))];
}

async function footLine(box) {
  const info = await api('api/info').catch(() => null);
  if (!info) return;
  const count = t('{0} phiên đang chạy', S.list.length);
  box.textContent = `termi ${info.version} · ${info.host} · ${count}`;
}

export async function welcome(box) {
  if (box.querySelector('.home')) return;
  const home = el('div', 'home');
  const card = el('div', 'hcard');
  const latest = latestSession(S.list);
  if (latest) card.append(el('div', 'hh', t('Tiếp tục')), continueRow(latest));
  const list = el('div', 'hlist');
  card.append(el('div', 'hh', t('Project gần đây')), list, cardFoot());
  const line = el('div', 'hline');
  home.append(hero(), card);
  if (!store.get('termi-tips-done')) home.append(await firstRunTips());
  home.append(line);
  box.replaceChildren(home);
  list.replaceChildren(...(await projectRows()));
  footLine(line);
}
