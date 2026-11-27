import { api } from './api.mjs';
import { $, el, wide } from './dom.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { renderSessions, stateEl } from './sessions.mjs';
import { S, go, st } from './state.mjs';

export async function loadOtherMachines() {
  const others = (S.machines || []).filter(m => m.termi && (m.id || '') !== (st().m || ''));
  S.others = (
    await Promise.all(
      others.map(async m => {
        const r = await fetch(m.id ? `/m/${encodeURIComponent(m.id)}/api/sessions` : '/api/sessions').then(
          x => (x.ok ? x.json() : []),
          () => [],
        );
        return { m, list: Array.isArray(r) ? r : [] };
      }),
    )
  ).filter(x => x.list.length);
  renderSessions();
}
export function renderOthers(box) {
  box.querySelectorAll('.om').forEach(n => n.remove());
  for (const { m, list } of S.others || []) {
    const h = el('div', 'pj om'),
      t = el('div', 'pjt');
    t.innerHTML = icon('monitor');
    t.append(el('span', 'pjn', m.self ? `${m.name} (máy này)` : m.name), el('span', 'pjc', String(list.length)));
    h.append(t);
    box.append(h);
    for (const x of list) {
      const b = el('button', 'si om');
      b.type = 'button';
      const top = el('div', 'sit');
      top.append(el('span', 'nm', x.title || x.name), stateEl(x.state, null, x.since));
      const body = el('div', 'sib');
      body.append(top, el('div', 'sip', `${x.dir.split('/').pop()}${x.model ? ' · ' + x.model : ''}`));
      b.append(agentAvatar(x.agent, true), body);
      b.onclick = () => go({ m: m.id || null, s: x.name, t: 'term', d: null, g: null, v: null });
      box.append(b);
    }
  }
}
export async function loadMachines() {
  const list = await api('/api/machines').catch(() => []);
  S.machines = list;
  loadOtherMachines();
  $('machines').hidden = list.length < 2;
  $('machine').replaceChildren(
    ...list.map(m =>
      Object.assign(
        el(
          'option',
          null,
          m.self
            ? `💻 ${m.name} (máy này)`
            : `🖥 ${m.name}${m.termi ? '' : m.online ? ' · chưa cài termi' : ' · offline'}`,
        ),
        { value: m.id, disabled: !m.termi },
      ),
    ),
  );
  $('machine').value = st().m || '';
}
export function setupMachines() {
  $('machine').onchange = e =>
    go({ m: e.target.value || null, s: null, d: null, g: null, v: null, t: wide() ? null : 'sessions' });
  loadMachines();
}
