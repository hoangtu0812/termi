import { allTerms } from './term-pool.mjs';
import { t } from './i18n.mjs';

export const THEMES = {
  auto: [t('Tự động'), 'contrast'],
  light: [t('Sáng'), 'sun'],
  dark: [t('Tối'), 'moon'],
  slate: [t('Xanh đêm'), 'layers'],
};
export const ACCENTS = { orange: '#e07a55', violet: '#8b5cf6', blue: '#3b82f6', green: '#22c55e' };
const ACCENT_KEY = 'termi-accent';
const THEME_COLORS = { light: '#ffffff', dark: '#0d0e11', slate: '#090d16' };
let colorScheme = null;
const lightQuery = () => colorScheme ?? matchMedia('(prefers-color-scheme: light)');
export function themePref() {
  try {
    return THEMES[localStorage.getItem('termi-theme')] ? localStorage.getItem('termi-theme') : 'auto';
  } catch {
    return 'auto';
  }
}
function applyTheme() {
  const pref = themePref(),
    theme = pref === 'auto' ? (lightQuery().matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]').content = THEME_COLORS[theme];
  try {
    termTheme();
  } catch {}
}
const TERM_THEMES = {
  dark: {
    background: '#0d0e11',
    foreground: '#d9dbe1',
    cursor: '#e07a55',
    cursorAccent: '#0d0e11',
    selectionBackground: '#e07a5544',
    black: '#1b1d23',
    red: '#ef6b73',
    green: '#5fc48a',
    yellow: '#e8b339',
    blue: '#6aa7ff',
    magenta: '#c58af9',
    cyan: '#4fc3d6',
    white: '#c9ccd3',
    brightBlack: '#5d6370',
    brightRed: '#ff8a91',
    brightGreen: '#7ad9a2',
    brightYellow: '#f3c968',
    brightBlue: '#8dbcff',
    brightMagenta: '#d6a6ff',
    brightCyan: '#77d6e5',
    brightWhite: '#f2f3f5',
  },
  light: {
    background: '#f7f7f8',
    foreground: '#1f2329',
    cursor: '#c95f3a',
    cursorAccent: '#f7f7f8',
    selectionBackground: '#c95f3a33',
    black: '#1f2329',
    red: '#d33f49',
    green: '#1f9d5c',
    yellow: '#a86f00',
    blue: '#2f6fdf',
    magenta: '#9b4dca',
    cyan: '#0f8a9d',
    white: '#8a909c',
    brightBlack: '#5f6675',
    brightRed: '#e5535c',
    brightGreen: '#24b36a',
    brightYellow: '#c28400',
    brightBlue: '#4a85f0',
    brightMagenta: '#b065e0',
    brightCyan: '#1aa3b8',
    brightWhite: '#b8bcc6',
  },
};
export function accentPref() {
  try {
    return ACCENTS[localStorage.getItem(ACCENT_KEY)] ? localStorage.getItem(ACCENT_KEY) : 'orange';
  } catch {
    return 'orange';
  }
}

export function setAccent(accent) {
  try {
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    return;
  }
  document.documentElement.dataset.accent = accent;
  termTheme();
}

function terminalTheme() {
  const name = document.documentElement.dataset.theme;
  const base = TERM_THEMES[name === 'light' ? 'light' : 'dark'];
  const background = name === 'slate' ? '#090d16' : base.background;
  const cursor = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || base.cursor;
  return { ...base, background, cursorAccent: background, cursor, selectionBackground: `${cursor}44` };
}

export function termTheme() {
  const theme = terminalTheme();
  for (const term of allTerms()) {
    term.options.theme = theme;
    term.element.ownerDocument.body.style.background = theme.background;
  }
}
export function setTheme(pref) {
  try {
    localStorage.setItem('termi-theme', pref);
  } catch {}
  applyTheme();
}
export function setupTheme() {
  colorScheme = matchMedia('(prefers-color-scheme: light)');
  colorScheme.addEventListener('change', applyTheme);
  applyTheme();
}
