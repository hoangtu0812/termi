import { api, safely } from './api.mjs';
import { $, el, ltr, short } from './dom.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { loadRepos, poll } from './poll.mjs';
import { S, cur, go } from './state.mjs';
import { t } from './i18n.mjs';

const NF = () => $('d-new').querySelector('form');
let pkName = '';
const pickDir = safely(async dir => {
  const f = NF();
  const r = await api('api/ls?dir=' + encodeURIComponent(dir));
  f.dir.value = r.dir;
  $('pk-crumb').textContent = ltr(short(r.dir));
  $('pk-up').disabled = !r.parent;
  $('pk-up').onclick = () => pickDir(r.parent);
  if (!f.name.value || f.name.value === pkName)
    f.name.value = pkName = r.dir
      .split('/')
      .pop()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  const dirs = r.entries.filter(e => e.dir && !e.name.startsWith('.'));
  $('pk-list').replaceChildren(
    ...dirs.map(e => {
      const b = el('button', 'row dir');
      b.type = 'button';
      b.innerHTML = icon('folder');
      b.append(el('span', 'nm', e.name));
      b.onclick = () => pickDir(e.path);
      return b;
    }),
  );
  if (!dirs.length) $('pk-list').replaceChildren(el('div', 'empty', t('Không có thư mục con')));
});
export async function newSession() {
  NF().reset();
  pkName = '';
  $('d-new').showModal();
  const agents = await api('api/agents').catch(() => []);
  NF().agent.replaceChildren(
    ...agents.map(a => Object.assign(el('option', null, a.name), { value: a.id })),
    Object.assign(el('option', null, t('Không, chỉ mở shell')), { value: '' }),
  );
  NF().agent.value = cur()?.agent && agents.some(a => a.id === cur().agent) ? cur().agent : (agents[0]?.id ?? '');
  const chips = [...agents.map(a => [a.id, a.name]), ['', 'Shell']].map(([id, name]) => {
    const b = el('button', 'agc');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.append(agentAvatar(id || null, true), name);
    b.onclick = () => {
      NF().agent.value = id;
      chips.forEach(([x, c]) => {
        c.classList.toggle('on', x === id);
        c.setAttribute('aria-checked', x === id);
      });
    };
    return [id, b];
  });
  $('ag-chips').replaceChildren(...chips.map(([, b]) => b));
  chips.find(([id]) => id === NF().agent.value)?.[1].click();
  await loadRepos($('pk-recent'), null, true);
  $('pk-recent').prepend(
    Object.assign(el('option', null, t('— chọn nhanh —')), { value: '', selected: true, disabled: true }),
  );
  await pickDir(cur()?.dir || S.dirs.recent[0] || S.dirs.roots[0]);
}
export function setupNewSession() {
  $('pk-recent').onchange = e => pickDir(e.target.value);
  NF().dir.onchange = e => pickDir(e.target.value.replace(/^~(?=\/|$)/, S.dirs.roots[0] || '~'));
  NF().dir.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  };
  for (const b of [$('b-new'), $('b-new-m'), ...document.querySelectorAll('[data-new]')]) b.onclick = newSession;
  $('d-new').onclose = safely(async () => {
    if ($('d-new').returnValue !== 'ok') return;
    const f = $('d-new').querySelector('form');
    await api('api/sessions', { name: f.name.value, dir: f.dir.value, agent: f.agent.value || undefined });
    const name = f.name.value;
    f.reset();
    await poll();
    go({ s: name, t: 'term', d: null, g: null });
  });
}
