import { api, safely, toast } from './api.mjs';
import { el } from './dom.mjs';

export async function notifyForm() {
  const p = await api('/api/notify'),
    box = el('div', 'nform');
  const save = safely(async () => {
    Object.assign(p, await api('/api/notify', p));
    toast('Đã lưu cài đặt thông báo');
  });
  const check = (label, get, set) => {
    const l = el('label', 'chk2'),
      c = Object.assign(el('input'), { type: 'checkbox', checked: get() });
    c.onchange = () => {
      set(c.checked);
      save();
    };
    l.append(c, ' ' + label);
    return l;
  };
  const time = (get, set) => {
    const i = Object.assign(el('input', 'tm'), { type: 'time', value: get() });
    i.onchange = () => {
      set(i.value);
      save();
    };
    return i;
  };
  const quiet = el('div', 'qh');
  quiet.append(
    check(
      'Giờ yên lặng từ',
      () => p.quiet.on,
      v => {
        p.quiet.on = v;
      },
    ),
    time(
      () => p.quiet.from,
      v => {
        p.quiet.from = v;
      },
    ),
    ' đến ',
    time(
      () => p.quiet.to,
      v => {
        p.quiet.to = v;
      },
    ),
  );
  box.append(
    check(
      'Agent cần bạn xác nhận',
      () => p.waiting,
      v => {
        p.waiting = v;
      },
    ),
    check(
      'Agent đã xong việc',
      () => p.done,
      v => {
        p.done = v;
      },
    ),
    quiet,
  );
  if (p.muted.length) {
    const m = el('div', 'muted');
    m.append(el('small', null, 'Phiên đã tắt thông báo:'));
    for (const k of p.muted) {
      const b = el('button', 'btn sm', `${k.replace(/^\//, '')} ✕`);
      b.type = 'button';
      b.onclick = () => {
        p.muted = p.muted.filter(x => x !== k);
        b.remove();
        save();
      };
      m.append(b);
    }
    box.append(m);
  }
  return box;
}
