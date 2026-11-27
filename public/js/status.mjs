import { api } from './api.mjs';
import { connText, currentLevel } from './conn.mjs';
import { $, el, wide } from './dom.mjs';
import { t } from './i18n.mjs';
import { icon } from './icons.mjs';
import { S, cur, go } from './state.mjs';

const CI_TEXT = {
  failure: () => t('Pipeline lỗi'),
  running: () => t('Pipeline đang chạy'),
};
let version = '';

function item(cls, iconName, text, onClick) {
  const node = el(onClick ? 'button' : 'span', `sbi ${cls}`);
  if (onClick) {
    node.type = 'button';
    node.onclick = onClick;
  }
  if (iconName) node.innerHTML = icon(iconName);
  node.append(text);
  return node;
}

function connItem() {
  const node = item(`conn-${currentLevel()}`, null, '', null);
  node.prepend(el('i', 'sdot'));
  node.append(currentLevel() === 'ok' ? t('Đã kết nối') : connText());
  node.title = connText();
  return node;
}

function gitItems(session) {
  const ci = S.ciState?.dir === session.dir ? S.ciState : null;
  const items = [];
  if (ci?.branch) items.push(item('', 'git', ci.branch, () => go({ p: 'git' })));
  if (session.changes) items.push(item('', 'edit', t('{0} file chưa commit', session.changes), () => go({ p: 'git' })));
  if (ci?.provider) {
    const text = CI_TEXT[ci.badge]?.() ?? t('Pipeline ổn');
    items.push(item(`ci-${ci.badge || 'ok'}`, 'zap', text, () => go({ p: 'ci' })));
  }
  return items;
}

export function renderStatus() {
  const bar = $('status');
  if (!bar || !wide()) return;
  const session = cur();
  const machine = $('machine').selectedOptions[0]?.textContent.replace(/^\S+\s/, '') || '';
  const left = [connItem(), item('', 'monitor', machine, null), ...(session ? gitItems(session) : [])];
  const right = [];
  if (!$('b-usage').hidden) {
    const usage = item($('b-usage').className.replace('uchip', 'use'), 'gauge', $('b-usage').textContent,
      () => $('b-usage').click());
    right.push(usage);
  }
  if (version) right.push(item('ver', null, `termi ${version}`, () => $('b-settings').click()));
  bar.replaceChildren(...left, el('span', 'sbgap'), ...right);
}

export function setupStatus() {
  api('api/info').then(info => {
    version = info.version;
    renderStatus();
  }, () => {});
  S.onConn = renderStatus;
  S.onUsage = renderStatus;
}
