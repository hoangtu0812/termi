import { api, safely } from './api.mjs';
import { $, el, short, skel } from './dom.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { notifyForm } from './notify-form.mjs';
import { enablePush } from './push.mjs';
import { fontSize, setFont } from './terminal.mjs';
import { THEMES, setTheme, themePref } from './theme.mjs';

function settingRow(title, ...children) {
  const r = el('div', 'srow');
  r.append(el('div', 'st', title), ...children);
  return r;
}
export function setupSettings() {
  $('b-settings').onclick = safely(async () => {
    $('d-settings').showModal();
    const body = $('settings-body');
    body.replaceChildren(...skel(4));
    const [info, reg] = await Promise.all([api('/api/info'), navigator.serviceWorker?.getRegistration()]);
    const pushOn = !!(await reg?.pushManager?.getSubscription()) && Notification.permission === 'granted';
    const seg = el('div', 'seg2');
    for (const [k, [name, ic]] of Object.entries(THEMES)) {
      const b = el('button', themePref() === k ? 'on' : '');
      b.type = 'button';
      b.innerHTML = icon(ic);
      b.append(name);
      b.onclick = () => {
        setTheme(k);
        seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      };
      seg.append(b);
    }
    const fs = el('div', 'seg2'),
      val = el('span', 'fsv', String(fontSize));
    const fb = (label, d) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.onclick = () => {
        setFont(fontSize + d);
        val.textContent = fontSize;
      };
      return b;
    };
    fs.append(fb('A−', -1), val, fb('A+', 1));
    const nb = el('button', 'btn sm', pushOn ? 'Đang bật · gửi thử' : 'Bật thông báo đẩy');
    nb.type = 'button';
    nb.onclick = () => enablePush();
    const cu = el(
      'div',
      'sv',
      info.claudeUsage
        ? '✓ Đã bật (hiện trong chip Usage trên header)'
        : 'Chưa bật. Trong một phiên Claude, gõ: ! node ~/.termi/app/current/scripts/claude-statuslin' +
            'e.mjs install',
    );
    const ag = el('div', 'sv');
    ag.append(
      ...(info.agents.length
        ? info.agents.map(a => {
            const s = el('span', 'agi');
            s.append(agentAvatar(a.id, true), a.name);
            return s;
          })
        : ['Chưa có agent nào']),
    );
    body.replaceChildren(
      settingRow('Giao diện', seg),
      settingRow('Cỡ chữ terminal', fs),
      settingRow('Thông báo đẩy', nb),
      settingRow('Báo khi', await notifyForm()),
      settingRow('Hạn mức Claude trong Usage', cu),
      settingRow('Agent trên máy này', ag),
      settingRow('Thư mục được phép truy cập', el('div', 'sv mono', info.roots.map(short).join('\n'))),
      settingRow('Máy chủ', el('div', 'sv', `${info.host} · ${info.platform} · termi ${info.version}`)),
      settingRow(
        'Bản phát hành',
        Object.assign(el('a', 'sv', 'github.com/hoangtu0812/termi/releases'), {
          href: 'https://github.com/hoangtu0812/termi/releases',
          target: '_blank',
          rel: 'noopener',
        }),
      ),
    );
  });
}
