import { fail } from '../errors.mjs';
import { validTime } from '../validate.mjs';

const FILE = 'notify.json';
const QUIET_FROM = '23:00';
const QUIET_TO = '07:00';
const MAX_MUTED = 200;
const MAX_KEY_CHARS = 120;
const MINUTES_PER_HOUR = 60;

export const NOTIFY_DEFAULT = {
  waiting: true,
  done: true,
  system: true,
  quiet: { on: false, from: QUIET_FROM, to: QUIET_TO },
  muted: [],
};

function minutesOf(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * MINUTES_PER_HOUR + (minutes || 0);
}

function inQuietHours(quiet, now) {
  const current = now.getHours() * MINUTES_PER_HOUR + now.getMinutes();
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (from <= to) return current >= from && current < to;
  return current >= from || current < to;
}

export function shouldPush(prefs, kind, key, now = new Date()) {
  if (!prefs[kind] || prefs.muted?.includes(key)) return false;
  return !(prefs.quiet?.on && inQuietHours(prefs.quiet, now));
}

export function parseNotifyPrefs(body) {
  const quiet = body.quiet || {};
  if (!validTime(quiet.from ?? QUIET_FROM) || !validTime(quiet.to ?? QUIET_TO)) {
    throw fail(400, 'Giờ không hợp lệ (HH:MM)');
  }
  const isKey = item => typeof item === 'string' && item.length < MAX_KEY_CHARS;
  const muted = Array.isArray(body.muted) ? body.muted.filter(isKey).slice(0, MAX_MUTED) : [];
  return {
    waiting: Boolean(body.waiting),
    done: Boolean(body.done),
    system: body.system !== false,
    quiet: { on: Boolean(quiet.on), from: quiet.from || QUIET_FROM, to: quiet.to || QUIET_TO },
    muted,
  };
}

export async function loadNotifyPrefs(store) {
  let prefs = { ...NOTIFY_DEFAULT, ...(await store.read(FILE)) };
  return {
    get: () => prefs,
    async set(body) {
      prefs = parseNotifyPrefs(body);
      await store.write(FILE, prefs);
      return prefs;
    },
  };
}
