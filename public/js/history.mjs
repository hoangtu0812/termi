import { api, safely } from './api.mjs';
import { $, agentName, ago, el, short, skel } from './dom.mjs';
import { agentAvatar } from './icons.mjs';
import { poll } from './poll.mjs';
import { cur, go } from './state.mjs';

const showHistory = safely(async all => {
  const box = $('hist-list');
  box.replaceChildren(...skel(5));
  if (!$('d-hist').open) $('d-hist').showModal();
  const dir = all ? null : cur()?.dir;
  const list = await api('api/history' + (dir ? '?dir=' + encodeURIComponent(dir) : ''));
  box.replaceChildren(
    ...list.map(h => {
      const b = el('button');
      b.type = 'button';
      const t2 = el('span', 't2');
      t2.append(agentAvatar(h.agent, true), `${agentName(h.agent)} · ${short(h.cwd)} · ${ago(h.mtime)}`);
      b.append(el('span', 't1', h.title), t2);
      b.onclick = safely(async () => {
        const base = (h.cwd.split('/').pop() || 'claude').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 30) || 'claude';
        const name = prompt('Tên phiên mới để mở lại hội thoại:', base);
        if (!name) return;
        await api('api/sessions', { name, dir: h.cwd, agent: h.agent, resume: h.id });
        $('d-hist').close();
        await poll();
        go({ s: name, t: 'term', d: null, g: null });
      });
      return b;
    }),
  );
  if (!list.length)
    box.replaceChildren(el('div', 'empty', dir ? `Chưa có hội thoại nào ở ${short(dir)}` : 'Không có hội thoại nào'));
  if (dir) {
    const b = el('button', 'btn', 'Xem mọi thư mục');
    b.type = 'button';
    b.onclick = () => showHistory(true);
    box.append(b);
  }
});
export function setupHistory() {
  $('b-hist').onclick = () => showHistory(false);
}
