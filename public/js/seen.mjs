import { st } from './state.mjs';
import { store } from './storage.mjs';

export const seenKeyOf = name => `${st().m || ''}/${name}`;
export const seenMap = () => {
  try {
    return JSON.parse(store.get('termi-seen') || '{}');
  } catch {
    return {};
  }
};
export function markSeen(name) {
  const m = seenMap(),
    k = seenKeyOf(name),
    now = Date.now();
  if (now - (m[k] || 0) < 5000) return;
  m[k] = now;
  store.set('termi-seen', JSON.stringify(m));
}
