import { api, safely } from './api.mjs';
import { $, agentName, el } from './dom.mjs';
import { icon } from './icons.mjs';
import { poll } from './poll.mjs';
import { S, cur } from './state.mjs';
import { t } from './i18n.mjs';

function renderMulti(x, box, sig) {
  box.dataset.sig = sig;
  const head = el('div', 'cq');
  head.innerHTML = icon('bell');
  head.append(x.question || t('Chọn một hoặc nhiều mục'));
  const rows = x.options.map(o => {
    const b = el('button', 'btn ck' + (o.checked ? ' on' : ''));
    b.type = 'button';
    b.append(el('span', 'box', o.checked ? '✓' : ''), `${o.n}. ${o.label}`);
    b.onclick = safely(async () => {
      b.classList.toggle('on');
      b.firstChild.textContent = b.classList.contains('on') ? '✓' : '';
      await api('api/send', { session: x.name, key: String(o.n) });
    });
    return b;
  });
  const acts = el('div', 'cacts'),
    go2 = el('button', 'btn pri', t('Gửi')),
    esc = el('button', 'btn', t('Huỷ (Esc)'));
  go2.type = esc.type = 'button';
  go2.onclick = safely(async () => {
    go2.disabled = true;
    await api('api/menu-submit', { session: x.name });
    box.hidden = true;
    box.dataset.sig = '';
    setTimeout(poll, 600);
  });
  esc.onclick = safely(async () => {
    await api('api/send', { session: x.name, key: 'Escape' });
    box.hidden = true;
    box.dataset.sig = '';
    setTimeout(poll, 600);
  });
  acts.append(go2, esc);
  box.replaceChildren(head, ...rows, acts);
}
export function renderConfirm() {
  const x = cur(),
    box = $('confirm');
  const show = x?.state === 'waiting' && (x.choices?.length || x.multi) && !$('composer').hidden;
  if (!show && !box.hidden && box.dataset.sig && box.dataset.name === x?.name && !$('composer').hidden) {
    S.confirmGone ||= Date.now();
    if (Date.now() - S.confirmGone < 4000) return setTimeout(renderConfirm, 4100);
  }
  S.confirmGone = 0;
  box.hidden = !show;
  if (!show) return;
  box.dataset.name = x.name;
  const sig = x.name + JSON.stringify(x.choices || x.options);
  if (x.multi) return box.dataset.sig === sig ? null : renderMulti(x, box, sig);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const head = el('div', 'cq');
  head.innerHTML = icon('bell');
  head.append(x.question || t('{0} cần bạn xác nhận', agentName(x.agent)));
  box.replaceChildren(
    head,
    ...x.choices.map(c => {
      const b = el('button', 'btn' + (c.n === 1 ? ' pri' : ''), `${c.n}. ${c.label}`);
      b.type = 'button';
      b.onclick = safely(async () => {
        await api('api/send', { session: x.name, key: String(c.n) });
        navigator.vibrate?.(15);
        box.hidden = true;
        box.dataset.sig = '';
        setTimeout(poll, 600);
      });
      return b;
    }),
  );
}
