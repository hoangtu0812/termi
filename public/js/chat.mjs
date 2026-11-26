import { api, safely } from './api.mjs';
import { $, agentName, el, skel } from './dom.mjs';
import { icon } from './icons.mjs';
import { mdSafe } from './sanitize.mjs';
import { cur, st } from './state.mjs';
import { openFile, rawUrl } from './viewer.mjs';

const chatCache = new Map();
let chatKey = '';
function toolsCard(x) {
  const d = el('details', 'tools'),
    sm = el('summary'),
    last = x.steps.at(-1);
  sm.innerHTML = icon('zap');
  sm.append(el('b', null, `${x.steps.length} bước`), el('span', null, `${last.verb} ${last.detail}`));
  const ul = el('ul');
  ul.append(
    ...x.steps.map(st => {
      const li = el('li');
      li.append(el('b', null, st.verb), ' ', el('code', null, st.detail));
      return li;
    }),
  );
  d.append(sm, ul);
  return d;
}
async function bubble(m) {
  const key = m.who + '\u0000' + m.text;
  if (chatCache.has(key)) return chatCache.get(key);
  const b = el('div', 'msg ' + (m.who === 'user' ? 'me' : 'ai'));
  const body = el('div', 'mb');
  if (m.who === 'user') {
    body.textContent = m.text;
    for (const path of new Set(m.text.match(/\/[^\s'"]+\.(?:png|jpe?g|gif|webp)\b/gi) || [])) {
      const img = el('img', 'thumb');
      img.loading = 'lazy';
      img.alt = path.split('/').pop();
      img.src = rawUrl(path);
      img.onclick = () => openFile(path);
      img.onerror = () => img.remove();
      body.append(img);
    }
  } else {
    body.append(await mdSafe(m.text).catch(() => document.createTextNode(m.text)));
    for (const pre of body.querySelectorAll('pre')) {
      const wrap = el('div', 'code'),
        head = el('div', 'ch'),
        c = el('button');
      c.type = 'button';
      const label = t => {
        c.innerHTML = icon('copy');
        c.append(t);
      };
      label('Chép');
      c.onclick = async () => {
        await navigator.clipboard?.writeText(pre.querySelector('code')?.textContent ?? pre.textContent).then(
          () => label('Đã chép'),
          () => label('Không chép được'),
        );
        setTimeout(() => label('Chép'), 1500);
      };
      head.append(
        el('span', null, /language-([\w+-]+)/.exec(pre.querySelector('code')?.className || '')?.[1] || 'code'),
        c,
      );
      pre.replaceWith(wrap);
      wrap.append(head, pre);
    }
  }
  b.append(body);
  if (m.t)
    b.append(el('time', null, new Date(m.t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })));
  chatCache.set(key, b);
  return b;
}
export const loadChat = safely(async first => {
  const name = st().s;
  if (!name) return;
  const box = $('chat-list');
  if (first && box.dataset.for !== name) {
    box.dataset.for = name;
    box.replaceChildren(...skel(4, 'sk tall'));
    chatKey = '';
  }
  const r = await api('/api/chat?session=' + encodeURIComponent(name));
  if (st().s !== name) return;
  const last = r.items.at(-1);
  const key =
    `${name}|${r.items.length}|${last?.t}|${last?.text?.length ?? last?.steps?.length}` +
    `|${r.state}|${cur()?.doing?.detail}`;
  if (key === chatKey) return;
  chatKey = key;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const nodes = await Promise.all(r.items.map(x => (x.kind === 'tools' ? toolsCard(x) : bubble(x))));
  if (!r.agent) nodes.push(el('div', 'empty', 'Phiên này chưa chạy agent nào'));
  else if (!r.items.length) nodes.push(el('div', 'empty', 'Chưa có tin nhắn nào'));
  if (r.state === 'working') {
    const d = cur()?.doing,
      t = el('div', 'msg ai typing');
    const dots = el('i');
    dots.append(el('b'), el('b'), el('b'));
    t.append(dots, el('div', 'mb', d ? `${d.verb} ${d.detail}` : `${agentName(r.agent)} đang làm…`));
    nodes.push(t);
  }
  box.replaceChildren(...nodes);
  if (first || atBottom) box.scrollTop = box.scrollHeight;
});
