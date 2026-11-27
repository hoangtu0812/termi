import { api, safely, toast } from './api.mjs';
import { el } from './dom.mjs';
import { t } from './i18n.mjs';

function checkbox(label, owner, key, save) {
  const l = el('label', 'chk2');
  const c = Object.assign(el('input'), { type: 'checkbox', checked: owner()[key] });
  c.onchange = () => {
    owner()[key] = c.checked;
    save();
  };
  l.append(c, ' ' + label);
  return l;
}

function timeInput(owner, key, save) {
  const i = Object.assign(el('input', 'tm'), { type: 'time', value: owner()[key] });
  i.onchange = () => {
    owner()[key] = i.value;
    save();
  };
  return i;
}

function quietHours(prefs, save) {
  const quiet = el('div', 'qh');
  const range = el('span', 'qr');
  range.append(timeInput(() => prefs.quiet, 'from', save), t(' đến '), timeInput(() => prefs.quiet, 'to', save));
  quiet.append(checkbox(t('Giờ yên lặng từ'), () => prefs.quiet, 'on', save), range);
  return quiet;
}

function mutedSessions(prefs, save) {
  const m = el('div', 'muted');
  m.append(el('small', null, t('Phiên đã tắt thông báo:')));
  for (const key of prefs.muted) {
    const b = el('button', 'btn sm', `${key.replace(/^\//, '')} ✕`);
    b.type = 'button';
    b.onclick = () => {
      prefs.muted = prefs.muted.filter(x => x !== key);
      b.remove();
      save();
    };
    m.append(b);
  }
  return m;
}

export async function notifyForm() {
  const prefs = await api('api/notify');
  const box = el('div', 'nform');
  const save = safely(async () => {
    Object.assign(prefs, await api('api/notify', prefs));
    toast(t('Đã lưu cài đặt thông báo'));
  });
  box.append(
    checkbox(t('Agent cần bạn xác nhận'), () => prefs, 'waiting', save),
    checkbox(t('Agent đã xong việc'), () => prefs, 'done', save),
    checkbox(t('Sự cố: máy mất kết nối, ổ đĩa sắp đầy, termi tự khởi động lại'), () => prefs, 'system', save),
    quietHours(prefs, save),
  );
  if (prefs.muted.length) box.append(mutedSessions(prefs, save));
  return box;
}
