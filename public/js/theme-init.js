{
  const THEME_KEY = 'termi-theme';
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    saved = null;
  }
  const systemTheme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : systemTheme;
  let lang = null;
  try {
    lang = localStorage.getItem('termi-lang');
  } catch {
    lang = null;
  }
  document.documentElement.lang = lang === 'en' ? 'en' : 'vi';
}
