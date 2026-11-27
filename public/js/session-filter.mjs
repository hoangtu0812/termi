import { $, el } from './dom.mjs';
import { activeFilter, countByKind } from './session-label.mjs';
import { S } from './state.mjs';
import { t } from './i18n.mjs';

const MIN_SESSIONS = 3;
const CHIPS = [
  ['all', t('Tất cả')],
  ['waiting', t('Chờ bạn')],
  ['working', t('Đang chạy')],
  ['idle', t('Rảnh')],
];

function chip(kind, label, count, current, onChange) {
  const b = el('button', `fchip ${kind}` + (kind === current ? ' on' : ''));
  b.type = 'button';
  b.setAttribute('aria-pressed', String(kind === current));
  b.append(label, el('span', null, String(count)));
  b.onclick = () => {
    S.filter = kind;
    onChange();
  };
  return b;
}

export function renderFilter(onChange) {
  const counts = countByKind(S.list);
  const totals = { ...counts, all: S.list.length };
  const current = activeFilter(S.filter, counts);
  const box = $('sfilt');
  box.hidden = S.list.length < MIN_SESSIONS;
  const shown = CHIPS.filter(([kind]) => kind === 'all' || totals[kind]);
  box.replaceChildren(...shown.map(([kind, label]) => chip(kind, label, totals[kind], current, onChange)));
  return current;
}
