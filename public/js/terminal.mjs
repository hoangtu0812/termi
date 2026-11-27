import { api, base, toast } from './api.mjs';
import { setTerm } from './conn.mjs';
import { $, wide } from './dom.mjs';
import { paletteKey } from './palette.mjs';
import { markDown, resetRetryDelay, touchScroll, watchDisconnect } from './reconnect.mjs';
import { S, st } from './state.mjs';
import { activeEntry, allTerms, isActive, poolKey, pruneFrames, showFrame } from './term-pool.mjs';
import { termTheme } from './theme.mjs';
import { t } from './i18n.mjs';

const termSrc = name => `${base()}term/?arg=${encodeURIComponent(name)}&fontSize=${fontSize}`;

function revealTerminal(entry) {
  S.lastData = entry.lastData;
  markDown(entry.down);
  if (!entry.term) return;
  entry.term.options.fontSize = fontSize;
  termTheme();
  entry.term.fit();
  fitTmux();
}

export function ensureTerm(name, force) {
  const key = poolKey(st().m || '', name);
  if (S.termKey === key && !force) return;
  S.termName = name;
  S.termKey = key;
  const { entry, created } = showFrame({ container: $('p-term').querySelector('.term-wrap'), key,
    src: termSrc(name), onLoad: onFrameLoad });
  if (created) return markDown(false);
  if (force || entry.down) {
    entry.down = false;
    entry.term = null;
    entry.frame.src = termSrc(name);
    return markDown(false);
  }
  revealTerminal(entry);
}

export function pruneTerms() {
  pruneFrames(st().m || '', S.list.map(x => x.name));
  if (!activeEntry()) S.termKey = null;
}

export const termWin = () => {
  try {
    return activeEntry()?.frame.contentWindow ?? null;
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
      api('api/resize', { session: S.termName, cols: t.cols, rows: t.rows }).catch(() => {});
  }, 300);
}
const FONT_KEY = 'termi-font';
const MIN_FONT = 8;
const MAX_FONT = 22;
const READY_POLL_MS = 100;
const READY_TRIES = 50;
const STABLE_CONNECTION_MS = 10_000;
const MONO_FONT = '"JetBrains Mono",Menlo,Consolas,"Droid Sans Mono",monospace';
const CLIPBOARD_OSC = 52;

export let fontSize = 0;

function savedFontSize() {
  try {
    return Number(localStorage.getItem(FONT_KEY));
  } catch {
    return 0;
  }
}

export function setFont(n) {
  fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, n));
  try {
    localStorage.setItem(FONT_KEY, fontSize);
  } catch {}
  for (const t of allTerms()) {
    t.options.fontSize = fontSize;
    t.fit();
  }
  toast(t('Cỡ chữ {0}', fontSize));
}
function styleTerminal(w, t) {
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
}

function loadMonoFont(w, t) {
  const link = w.document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../fonts/fonts.css';
  const useFont = () => {
    t.options.fontFamily = MONO_FONT;
    t.fit();
    fitTmux();
  };
  link.onload = () =>
    Promise.all([400, 700].map(n => w.document.fonts.load(`${n} 14px "JetBrains Mono"`))).then(useFont, () => {});
  w.document.head.append(link);
}

function copyFromTmux(data) {
  const encoded = data.slice(data.indexOf(';') + 1);
  if (!encoded || encoded === '?') return true;
  try {
    const text = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
    navigator.clipboard.writeText(text).then(
      () => toast(t('Đã chép')),
      () => toast(t('Trình duyệt chặn chép, dùng nút 📋 Chép')),
    );
  } catch {
    return true;
  }
  return true;
}

function trackData(entry) {
  entry.lastData = Date.now();
  if (isActive(entry)) S.lastData = entry.lastData;
}

function markEntryDown(entry, down) {
  entry.down = down;
  if (isActive(entry)) markDown(down);
}

function attachTerminal(w, t, entry) {
  entry.term = t;
  setTimeout(() => {
    if (!entry.down) resetRetryDelay();
  }, STABLE_CONNECTION_MS);
  styleTerminal(w, t);
  loadMonoFont(w, t);
  t.onResize(() => isActive(entry) && fitTmux());
  trackData(entry);
  (t.onWriteParsed || t.onRender).call(t, () => trackData(entry));
  if (isActive(entry)) {
    setTerm('ok');
    fitTmux();
  }
  touchScroll(w, t);
  t.parser?.registerOscHandler(CLIPBOARD_OSC, copyFromTmux);
  watchDisconnect(t, down => markEntryDown(entry, down));
  w.document.addEventListener('pointerdown', fitTmux, true);
  w.document.addEventListener('keydown', fitTmux, true);
  w.document.addEventListener('keydown', paletteKey, true);
}

function waitForTerminal(w, entry) {
  let tries = 0;
  const wait = setInterval(() => {
    const t = w.term;
    if (!t?.element && ++tries < READY_TRIES) return;
    clearInterval(wait);
    if (!t?.element) return markEntryDown(entry, true);
    attachTerminal(w, t, entry);
  }, READY_POLL_MS);
}

function framePath(w) {
  try {
    return w?.location.pathname;
  } catch {
    return null;
  }
}

function onFrameLoad(entry) {
  const w = entry.frame.contentWindow;
  const page = framePath(w);
  if (page === null) return markEntryDown(entry, true);
  if (!page?.includes('term/')) return;
  waitForTerminal(w, entry);
}

export function setupTerminal() {
  fontSize = savedFontSize() || (wide() ? 14 : 12);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && fitTmux());
  window.addEventListener('focus', fitTmux);
  document.addEventListener('pointerdown', fitTmux, true);
}
