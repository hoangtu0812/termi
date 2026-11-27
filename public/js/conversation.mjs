import { api, safely } from './api.mjs';
import { bubble, toolsCard } from './chat.mjs';
import { agentName, ago, el, short } from './dom.mjs';
import { t } from './i18n.mjs';
import { openViewer } from './viewer.mjs';

function header(data) {
  const head = el('div', 'convhead');
  const meta = `${agentName(data.agent)} · ${short(data.cwd)} · ${ago(data.mtime)}`;
  head.append(el('b', null, data.title), el('small', null, meta));
  return head;
}

export const openConversation = safely(async id => {
  const data = await api(`api/conversation?id=${encodeURIComponent(id)}`);
  const box = el('div', 'chat convview');
  const nodes = await Promise.all(data.items.map(x => (x.kind === 'tools' ? toolsCard(x, data.cwd) : bubble(x))));
  box.append(header(data), ...(nodes.length ? nodes : [el('div', 'empty', t('Chưa có tin nhắn nào'))]));
  openViewer(data.title, box);
});

export function viewButton(id) {
  const a = el('span', 'sact');
  a.setAttribute('role', 'button');
  a.title = t('Xem hội thoại');
  a.setAttribute('aria-label', a.title);
  a.textContent = '👁';
  a.onclick = e => {
    e.stopPropagation();
    openConversation(id);
  };
  return a;
}
