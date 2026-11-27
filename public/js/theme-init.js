{
  const THEME_KEY = 'termi-theme';
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    saved = null;
  }
  const systemTheme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const THEMES = ['light', 'dark', 'slate'];
  document.documentElement.dataset.theme = THEMES.includes(saved) ? saved : systemTheme;
  let accent = null;
  try {
    accent = localStorage.getItem('termi-accent');
  } catch {
    accent = null;
  }
  document.documentElement.dataset.accent = ['violet', 'blue', 'green'].includes(accent) ? accent : 'orange';
  let lang = null;
  try {
    lang = localStorage.getItem('termi-lang');
  } catch {
    lang = null;
  }
  document.documentElement.lang = lang === 'en' ? 'en' : 'vi';
}
