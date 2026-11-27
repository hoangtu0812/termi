import { api, safely } from './api.mjs';
import { renderConfirm } from './confirm.mjs';
import { $, agentName, dur, el } from './dom.mjs';
import { poll } from './poll.mjs';
import { stateEl } from './sessions.mjs';
import { cur, st } from './state.mjs';
import { renderTabs } from './switcher.mjs';
import { t } from './i18n.mjs';
import { renderTabBadges } from './tab-badges.mjs';

export function renderTop() {
  const x = cur(),
    s = st();
  $('t-name').textContent = x?.title || s.s || 'termi';
  $('t-name').title = x?.title ? t('Phiên tmux: {0}', x.name) : '';
  $('t-state').replaceWith(
    Object.assign(x ? stateEl(x.state, x.agent, x.since, x.model) : el('span', 'state'), { id: 't-state' }),
  );
  $('text').placeholder = t('Nhắn cho {0}…', x?.agent ? agentName(x.agent) : 'agent');
  const m = st().m && [...$('machine').options].find(o => o.value === st().m);
  if (x)
    $('t-state').append(
      ' · ' +
        (m ? m.textContent.replace(/^\S+\s/, '').split(' · ')[0] + ' · ' : '') +
        (x.dir.split('/').pop() || x.dir),
    );
  $('t-state').title = x?.dir || '';
  $('b-menu').hidden = !x;
  renderTabs();
  renderConfirm();
  renderDoing();
  renderTabBadges();
}
function renderDoing() {
  const x = cur(),
    box = $('doing');
  const show = x?.state === 'working';
  box.hidden = !show;
  if (!show) return;
  const d = x.doing,
    stop = el('button', 'stop');
  stop.type = 'button';
  stop.title = t('Dừng (gửi Esc để ngắt agent)');
  stop.setAttribute('aria-label', t('Dừng agent'));
  stop.append(el('i'));
  box.title = `${d ? t(d.verb) + ' ' + (d.detail || '') : t('Đang làm')} · ${dur(x.since)}`;
  stop.onclick = safely(async () => {
    await api('api/send', { session: x.name, key: 'Escape' });
    navigator.vibrate?.(15);
    setTimeout(poll, 500);
  });
  const txt = el('span', 'dt');
  txt.append(
    el('b', null, d ? t(d.verb) : t('Đang làm')),
    d?.detail ? ' ' + d.detail : '',
    el('small', null, ' · ' + dur(x.since)),
  );
  box.replaceChildren(el('i', 'spin'), txt, stop);
}
