import { api, safely, toast } from './api.mjs';
import { el } from './dom.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { poll } from './poll.mjs';
import { loadProjects, renderSessions } from './sessions.mjs';
import { S, go } from './state.mjs';
import { t } from './i18n.mjs';

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
  const title = el('b', null, t('Khôi phục {0} phiên', S.restore.length));
  d.append(title, el('small', null, t('từ trước lần khởi động lại máy')));
  for (const x of S.restore) {
    const n = el('span', 'wbtn');
    n.append(agentAvatar(x.agent, true), x.name);
    names.append(n);
  }
  const ok = el('button', 'btn pri sm', t('Khôi phục')),
    no = el('button', 'btn sm', t('Bỏ qua'));
  ok.type = no.type = 'button';
  ok.onclick = safely(async () => {
    ok.disabled = true;
    const r = await api('api/restore', {});
    toast(
      t('Đã khôi phục {0} phiên', r.done.length) + (r.failed.length ? t(' · lỗi: {0}', r.failed.join('; ')) : ''),
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
  throw new Error(t('Không tìm được tên phiên còn trống'));
}
