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
    ...x.steps.map(step => {
      const li = el('li');
      li.append(el('b', null, step.verb), ' ', el('code', null, step.detail));
      return li;
    }),
  );
  d.append(sm, ul);
  return d;
}
const IMAGE_PATH = /\/[^\s'"]+\.(?:png|jpe?g|gif|webp)\b/gi;
const COPY_RESET_MS = 1500;

function imageThumbs(body, text) {
  for (const path of new Set(text.match(IMAGE_PATH) || [])) {
    const img = el('img', 'thumb');
    img.loading = 'lazy';
    img.alt = path.split('/').pop();
    img.src = rawUrl(path);
    img.onclick = () => openFile(path);
    img.onerror = () => img.remove();
    body.append(img);
  }
}

function copyButton(pre) {
  const c = el('button');
  c.type = 'button';
  const label = text => {
    c.innerHTML = icon('copy');
    c.append(text);
  };
  label('Chép');
  c.onclick = async () => {
    await navigator.clipboard?.writeText(pre.querySelector('code')?.textContent ?? pre.textContent).then(
      () => label('Đã chép'),
      () => label('Không chép được'),
    );
    setTimeout(() => label('Chép'), COPY_RESET_MS);
  };
  return c;
}

function frameCodeBlock(pre) {
  const wrap = el('div', 'code');
  const head = el('div', 'ch');
  const language = /language-([\w+-]+)/.exec(pre.querySelector('code')?.className || '')?.[1] || 'code';
  head.append(el('span', null, language), copyButton(pre));
  pre.replaceWith(wrap);
  wrap.append(head, pre);
}

async function bubbleBody(m) {
  const body = el('div', 'mb');
  if (m.who === 'user') {
    body.textContent = m.text;
    imageThumbs(body, m.text);
    return body;
  }
  body.append(await mdSafe(m.text).catch(() => document.createTextNode(m.text)));
  for (const pre of body.querySelectorAll('pre')) frameCodeBlock(pre);
  return body;
}

const timeLabel = t => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

async function bubble(m) {
  const key = m.who + '\u0000' + m.text;
  if (chatCache.has(key)) return chatCache.get(key);
  const b = el('div', 'msg ' + (m.who === 'user' ? 'me' : 'ai'));
  b.append(await bubbleBody(m));
  if (m.t) b.append(el('time', null, timeLabel(m.t)));
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
