import { api, safely, toast } from './api.mjs';
import { ago, el, ltr, short } from './dom.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { newSession } from './new-session.mjs';
import { poll } from './poll.mjs';
import { loadProjects, renderSessions } from './sessions.mjs';
import { S, go } from './state.mjs';

export async function loadRestore() {
  S.restore = await api('api/restore').catch(() => []);
  renderSessions();
}
export function renderRestore(box) {
  box.querySelector('.restore')?.remove();
  if (!S.restore?.length) return;
  const c = el('div', 'wcard restore'),
    names = el('div', 'wa'),
    acts = el('div', 'wa');
  const d = el('div', 'wd');
  d.innerHTML = icon('history');
  d.append(el('b', null, `Khôi phục ${S.restore.length} phiên`), el('small', null, 'từ trước lần khởi động lại máy'));
  for (const x of S.restore) {
    const n = el('span', 'wbtn');
    n.append(agentAvatar(x.agent, true), x.name);
    names.append(n);
  }
  const ok = el('button', 'btn pri sm', 'Khôi phục'),
    no = el('button', 'btn sm', 'Bỏ qua');
  ok.type = no.type = 'button';
  ok.onclick = safely(async () => {
    ok.disabled = true;
    const r = await api('api/restore', {});
    toast(
      `Đã khôi phục ${r.done.length} phiên` + (r.failed.length ? ` · lỗi: ${r.failed.join('; ')}` : ''),
      !!r.failed.length,
    );
    S.restore = [];
    await poll();
  });
  no.onclick = safely(async () => {
    await api('api/restore/dismiss', {});
    S.restore = [];
    renderSessions();
  });
  acts.append(ok, no);
  c.append(d, names, acts);
  box.prepend(c);
}
const GREETINGS = [
  [11, 'Chào buổi sáng'],
  [14, 'Chào buổi trưa'],
  [18, 'Chào buổi chiều'],
  [24, 'Chào buổi tối'],
];
const RECENT_PROJECTS = 6;

function greeting(hour = new Date().getHours()) {
  return GREETINGS.find(([until]) => hour < until)[1];
}

function welcomeIntro() {
  if (S.list.length) return 'Chọn một phiên bên trái, hoặc bắt đầu làm việc ở một project gần đây.';
  return 'Chọn project và agent để bắt đầu. Phiên chạy trong tmux trên máy, đóng app hay mất mạng vẫn còn nguyên.';
}

function welcomeShell(list) {
  const w = el('div', 'welcome');
  w.innerHTML = '<img src="icon.svg" alt="">';
  w.append(el('h2', null, greeting()), el('p', null, welcomeIntro()), el('div', 'wh', 'Project gần đây'), list);
  const more = el('button', 'btn');
  more.type = 'button';
  more.innerHTML = icon('folder') + 'Thư mục khác…';
  more.onclick = newSession;
  w.append(more);
  return w;
}

function resumeButton(dir, last) {
  const r = el('button', 'wr');
  r.type = 'button';
  r.title = 'Mở lại hội thoại này';
  r.innerHTML = icon('refresh');
  r.append(el('span', null, last.title), el('span', 'wt', ago(last.mtime)));
  r.onclick = safely(() => quickStart(dir, last.agent, last.id));
  return r;
}

function agentButtons(dir, agents) {
  const a = el('div', 'wa');
  for (const ag of agents) {
    const b = el('button', 'wbtn');
    b.type = 'button';
    b.append(agentAvatar(ag.id, true), ag.name);
    b.onclick = safely(() => quickStart(dir, ag.id));
    a.append(b);
  }
  return a;
}

function projectCard(dir, project, agents) {
  const c = el('div', 'wcard');
  const d = el('div', 'wd');
  const last = project?.conversations?.[0];
  d.innerHTML = icon('folder');
  d.append(el('b', null, dir.split('/').pop() || dir), el('small', null, ltr(short(dir))));
  if (project?.last) d.append(el('span', 'wt', ago(project.last)));
  c.append(d);
  if (last && !S.list.some(x => x.convId === last.id)) c.append(resumeButton(dir, last));
  c.append(agentButtons(dir, agents));
  return c;
}

export async function welcome(box) {
  if (box.querySelector('.welcome')) return;
  const list = el('div', 'wl');
  box.replaceChildren(welcomeShell(list));
  const [dirs, agents] = await Promise.all([
    api('api/dirs').catch(() => ({ recent: [] })),
    api('api/agents').catch(() => []),
  ]);
  const projects = new Map((S.projects || []).map(p => [p.dir, p]));
  const cards = dirs.recent.slice(0, RECENT_PROJECTS).map(dir => projectCard(dir, projects.get(dir), agents));
  list.replaceChildren(...cards);
  if (!dirs.recent.length) list.replaceChildren(el('div', 'empty', 'Chưa có project nào, bấm "Thư mục khác…" để chọn'));
}
export async function quickStart(dir, agent, resume) {
  const base =
    (dir.split('/').pop() || 'phien')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'phien';
  for (let i = 1; i < 10; i++) {
    const name = i === 1 ? base : `${base}-${i}`;
    try {
      await api('api/sessions', { name, dir, agent, ...(resume ? { resume } : {}) });
      loadProjects();
      await poll();
      return go({ s: name, t: 'term', d: null, g: null, v: null });
    } catch (e) {
      if (!/tồn tại/.test(e.message)) throw e;
    }
  }
  throw new Error('Không tìm được tên phiên còn trống');
}
