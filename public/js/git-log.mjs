import { el } from './dom.mjs';
import { commitRow, passingLanesSvg } from './git-graph.mjs';
import { locale, t } from './i18n.mjs';

const DAY_MS = 86_400_000;
const DATE_FORMAT = { weekday: 'long', day: '2-digit', month: '2-digit' };

const startOfDay = ts => new Date(ts).setHours(0, 0, 0, 0);

export function dayLabel(ts, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (days <= 0) return t('Hôm nay');
  if (days === 1) return t('Hôm qua');
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Date(ts).toLocaleDateString(locale(), sameYear ? DATE_FORMAT : { ...DATE_FORMAT, year: 'numeric' });
}

function dayRow(label, row, width) {
  const r = el('div', 'cday');
  r.insertAdjacentHTML('afterbegin', passingLanesSvg(row, width));
  r.append(el('span', null, label));
  return r;
}

export function logRows(g) {
  const rows = [];
  let lastDay = '';
  g.commits.forEach((c, i) => {
    const row = g.graph.rows[i];
    const day = dayLabel(c.t);
    if (day !== lastDay) rows.push(dayRow(day, row, g.graph.width));
    lastDay = day;
    rows.push(commitRow(c, row, g.graph.width, g.dir));
  });
  return rows;
}
