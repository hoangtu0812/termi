import { api, base, toast } from './api.mjs';
import { $, wide } from './dom.mjs';
import { paletteKey } from './palette.mjs';
import { b64 } from './push.mjs';
import { markDown, resetRetryDelay, touchScroll, watchDisconnect } from './reconnect.mjs';
import { S, st } from './state.mjs';
import { termTheme } from './theme.mjs';

export function ensureTerm(name, force) {
  if (S.termName === name && !force) return;
  S.termName = name;
  $('t-down').hidden = true;
  $('frame').src = `${base()}/term/?arg=${encodeURIComponent(name)}&fontSize=${fontSize}`;
}
export const termWin = () => {
  try {
    return $('frame').contentWindow;
  } catch {
    return null;
  }
};
let fitTimer;
export function fitTmux() {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    const t = termWin()?.term;
    if (t?.cols && st().s === S.termName)
      api('/api/resize', { session: S.termName, cols: t.cols, rows: t.rows }).catch(() => {});
  }, 300);
}
export let fontSize =
  (() => {
    try {
      return Number(localStorage.getItem('termi-font'));
    } catch {
      return 0;
    }
  })() || (wide() ? 14 : 12);
export function setFont(n) {
  fontSize = Math.min(22, Math.max(8, n));
  try {
    localStorage.setItem('termi-font', fontSize);
  } catch {}
  const t = termWin()?.term;
  if (t) {
    t.options.fontSize = fontSize;
    t.fit();
  }
  toast(`Cỡ chữ ${fontSize}`);
}
export function setupTerminal() {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && fitTmux());
  window.addEventListener('focus', fitTmux);
  document.addEventListener('pointerdown', fitTmux, true);
  $('frame').addEventListener('load', () => {
    const w = termWin();
    let page = null;
    try {
      page = w?.location.pathname;
    } catch {}
    if (page === null && S.termName) return markDown(true);
    if (!page?.includes('/term/')) return;
    let tries = 0;
    const wait = setInterval(() => {
      const t = w.term;
      if (!t?.element && ++tries < 50) return;
      clearInterval(wait);
      if (!t?.element) return markDown(true);
      setTimeout(() => {
        if ($('t-down').hidden) resetRetryDelay();
      }, 10_000);
      t.options.fontSize = fontSize;
      const pad = w.document.createElement('style');
      pad.textContent = [
        `.xterm { padding:${wide() ? '10px 6px 0 14px' : '6px 2px 0 8px'}; }`,
        'html, body { background:transparent; }',
        '.xterm-viewport { scrollbar-width:none; }',
        '.xterm-viewport::-webkit-scrollbar { display:none; }',
      ].join(' ');
      w.document.head.append(pad);
      Object.assign(t.options, { cursorStyle: 'bar', cursorWidth: 2, cursorBlink: true });
      termTheme();
      t.fit();
      const fl = w.document.createElement('link');
      fl.rel = 'stylesheet';
      fl.href = '/fonts/fonts.css';
      fl.onload = () =>
        Promise.all([400, 700].map(n => w.document.fonts.load(`${n} 14px "JetBrains Mono"`))).then(
          () => {
            t.options.fontFamily = '"JetBrains Mono",Menlo,Consolas,"Droid Sans Mono",monospace';
            t.fit();
            fitTmux();
          },
          () => {},
        );
      w.document.head.append(fl);
      t.onResize(fitTmux);
      S.lastData = Date.now();
      (t.onWriteParsed || t.onRender).call(t, () => {
        S.lastData = Date.now();
      });
      fitTmux();
      touchScroll(w, t);
      t.parser?.registerOscHandler(52, data => {
        const b64 = data.slice(data.indexOf(';') + 1);
        if (!b64 || b64 === '?') return true;
        try {
          const text = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
          navigator.clipboard.writeText(text).then(
            () => toast('Đã chép'),
            () => toast('Trình duyệt chặn chép, dùng nút 📋 Chép'),
          );
        } catch {}
        return true;
      });
      watchDisconnect(t);
      w.document.addEventListener('pointerdown', fitTmux, true);
      w.document.addEventListener('keydown', fitTmux, true);
      w.document.addEventListener('keydown', paletteKey, true);
    }, 100);
  });
}
