import { st } from './state.mjs';
import { store } from './storage.mjs';

const SESSION_TABS_KEY = 'termi-session-tabs';
const CODE_TAB_KEY = 'termi-code-tab';
const MAX_REMEMBERED = 100;
export const CODE_TABS = ['files', 'git', 'ci'];
const REMEMBERED = new Set(['chat', 'term', ...CODE_TABS]);

const read = () => {
  try {
    return JSON.parse(store.get(SESSION_TABS_KEY) || '{}');
  } catch {
    return {};
  }
};
const keyOf = name => `${st().m || ''}/${name}`;

export function rememberTab(name, tab) {
  if (CODE_TABS.includes(tab)) store.set(CODE_TAB_KEY, tab);
  if (!name || !REMEMBERED.has(tab)) return;
  const map = read();
  delete map[keyOf(name)];
  map[keyOf(name)] = tab;
  const keys = Object.keys(map);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED))) delete map[old];
  store.set(SESSION_TABS_KEY, JSON.stringify(map));
}

export const sessionTab = name => read()[keyOf(name)] || 'term';

export const codeTab = () => (CODE_TABS.includes(store.get(CODE_TAB_KEY)) ? store.get(CODE_TAB_KEY) : 'files');
