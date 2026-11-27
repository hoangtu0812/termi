import { api, safely } from './api.mjs';
import { $, el, short, skel } from './dom.mjs';
import { agentAvatar, icon } from './icons.mjs';
import { editorField } from './editor.mjs';
import { notifyForm } from './notify-form.mjs';
import { enablePush } from './push.mjs';
import { fontSize, setFont } from './terminal.mjs';
import { ACCENTS, THEMES, accentPref, setAccent, setTheme, themePref } from './theme.mjs';
import { LANGS, LANG_LABEL, LANG_NAMES, currentLang, setLang, t } from './i18n.mjs';

function settingRow(title, ...children) {
  const r = el('div', 'srow');
  r.append(el('div', 'st', title), ...children);
  return r;
}
const RELEASES = 'https://github.com/hoangtu0812/termi/releases';
const STATUSLINE_HINT =
  t('Chưa bật. Trong một phiên Claude, gõ: ! node ~/.termi/app/current/scripts/claude-statusline.mjs install');

async function switchLang(lang) {
  setLang(lang);
  const prefs = await api('api/notify').catch(() => null);
  if (prefs) await api('api/notify', { ...prefs, lang }).catch(() => null);
  location.reload();
}

function langPicker() {
  const seg = el('div', 'seg2');
  for (const lang of LANGS) {
    const b = el('button', currentLang() === lang ? 'on' : '', LANG_NAMES[lang]);
    b.type = 'button';
    b.lang = lang;
    b.onclick = () => lang !== currentLang() && switchLang(lang);
    seg.append(b);
  }
  return seg;
}

const ACCENT_NAMES = {
  orange: () => t('Cam'),
  violet: () => t('Tím'),
  blue: () => t('Xanh dương'),
  green: () => t('Xanh lục'),
};

function accentPicker() {
  const row = el('div', 'swatches');
  for (const [accent, color] of Object.entries(ACCENTS)) {
    const b = el('button', 'swatch' + (accentPref() === accent ? ' on' : ''));
    b.type = 'button';
    b.title = ACCENT_NAMES[accent]();
    b.setAttribute('aria-label', b.title);
    b.style.setProperty('--sw', color);
    b.onclick = () => {
      setAccent(accent);
      row.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === b));
    };
    row.append(b);
  }
  return row;
}

function themePicker() {
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
  return seg;
}

function fontPicker() {
  const fs = el('div', 'seg2');
  const val = el('span', 'fsv', String(fontSize));
  const step = (label, delta) => {
    const b = el('button', null, label);
    b.type = 'button';
    b.onclick = () => {
      setFont(fontSize + delta);
      val.textContent = fontSize;
    };
    return b;
  };
  fs.append(step('A−', -1), val, step('A+', 1));
  return fs;
}

function pushButton(pushOn) {
  const nb = el('button', 'btn sm', pushOn ? t('Đang bật · gửi thử') : t('Bật thông báo đẩy'));
  nb.type = 'button';
  nb.onclick = () => enablePush();
  return nb;
}

function agentList(agents) {
  const ag = el('div', 'sv');
  const items = agents.map(a => {
    const s = el('span', 'agi');
    s.append(agentAvatar(a.id, true), a.name);
    return s;
  });
  ag.append(...(items.length ? items : [t('Chưa có agent nào')]));
  return ag;
}

async function pushEnabled(registration) {
  return !!(await registration?.pushManager?.getSubscription()) && Notification.permission === 'granted';
}

async function settingRows(info, pushOn) {
  const usage = info.claudeUsage ? t('✓ Đã bật (hiện trong chip Usage trên header)') : STATUSLINE_HINT;
  const releases = Object.assign(el('a', 'sv', 'github.com/hoangtu0812/termi/releases'), {
    href: RELEASES,
    target: '_blank',
    rel: 'noopener',
  });
  return [
    settingRow(LANG_LABEL, langPicker()),
    settingRow(t('Giao diện'), themePicker()),
    settingRow(t('Màu nhấn'), accentPicker()),
    settingRow(t('Cỡ chữ terminal'), fontPicker()),
    settingRow(t('Thông báo đẩy'), pushButton(pushOn)),
    settingRow(t('Báo khi'), await notifyForm()),
    settingRow(t('Hạn mức Claude trong Usage'), el('div', 'sv', usage)),
    settingRow(t('VS Code web'), editorField(info.editorUrl)),
    settingRow(t('Agent trên máy này'), agentList(info.agents)),
    settingRow(t('Thư mục được phép truy cập'), el('div', 'sv mono', info.roots.map(short).join('\n'))),
    settingRow(t('Máy chủ'), el('div', 'sv', `${info.host} · ${info.platform} · termi ${info.version}`)),
    settingRow(t('Bản phát hành'), releases),
  ];
}

async function openSettings() {
  $('d-settings').showModal();
  const body = $('settings-body');
  body.replaceChildren(...skel(4));
  const [info, registration] = await Promise.all([api('api/info'), navigator.serviceWorker?.getRegistration()]);
  body.replaceChildren(...(await settingRows(info, await pushEnabled(registration))));
}

export function setupSettings() {
  $('b-settings').onclick = safely(openSettings);
}
