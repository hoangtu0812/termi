import { api, safely } from './api.mjs';
import { bubble, toolsCard } from './chat.mjs';
import { agentName, ago, el, short } from './dom.mjs';
import { poll } from './poll.mjs';
import { go } from './state.mjs';
import { t } from './i18n.mjs';
import { openViewer } from './viewer.mjs';

const MAX_SESSION_NAME = 30;

const sessionNameFor = cwd => (cwd.split('/').pop() || 'claude')
  .replace(/[^A-Za-z0-9_-]+/g, '-')
  .slice(0, MAX_SESSION_NAME) || 'claude';

export const resumeConversation = safely(async ({ id, agent, cwd }) => {
  const name = prompt(t('Tên phiên mới để mở lại hội thoại:'), sessionNameFor(cwd));
  if (!name) return false;
  await api('api/sessions', { name, dir: cwd, agent, resume: id });
  await poll();
  go({ s: name, t: 'term', d: null, g: null, v: null });
  return true;
});

function header(id, data) {
  const head = el('div', 'convhead');
  const meta = `${agentName(data.agent)} · ${short(data.cwd)} · ${ago(data.mtime)}`;
  const resume = el('button', 'btn', t('Tiếp tục hội thoại này'));
  resume.type = 'button';
  resume.onclick = () => resumeConversation({ id, agent: data.agent, cwd: data.cwd });
  head.append(el('b', null, data.title), el('small', null, meta), resume);
  return head;
}

export const openConversation = safely(async id => {
  const data = await api(`api/conversation?id=${encodeURIComponent(id)}`);
  const box = el('div', 'chat convview');
  const nodes = await Promise.all(data.items.map(x => (x.kind === 'tools' ? toolsCard(x, data.cwd) : bubble(x))));
  box.append(header(id, data), ...(nodes.length ? nodes : [el('div', 'empty', t('Chưa có tin nhắn nào'))]));
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
