import { shouldPush } from './prefs.mjs';
import { pushText } from './texts.mjs';

export const OFFLINE_ALERT_MS = 5 * 60_000;
export const DISK_ALERT_PERCENT = 95;
export const DISK_ALERT_FREE_BYTES = 5 * 1024 ** 3;
export const DISK_REPEAT_MS = 24 * 3_600_000;
const SYSTEM_KEY = 'system';
const GIGABYTE = 1024 ** 3;

export function machineTransitions(state, machines, now, threshold = OFFLINE_ALERT_MS) {
  const alerts = [];
  for (const machine of machines.filter(m => !m.self)) {
    const known = state.get(machine.id);
    if (machine.termi) {
      if (known?.alerted) alerts.push({ kind: 'up', machine });
      state.set(machine.id, { since: null, alerted: false });
      continue;
    }
    if (!known) continue;
    const since = known.since ?? now;
    const alerted = known.alerted || now - since >= threshold;
    if (alerted && !known.alerted) alerts.push({ kind: 'down', machine });
    state.set(machine.id, { since, alerted });
  }
  return alerts;
}

export function diskIsLow(usage) {
  if (!usage) return false;
  return usage.disk >= DISK_ALERT_PERCENT || (usage.diskFree != null && usage.diskFree < DISK_ALERT_FREE_BYTES);
}

const machineAlert = (lang, { kind, machine }) => (kind === 'down'
  ? { title: pushText(lang, 'machineDown', machine.name), body: pushText(lang, 'machineDownBody') }
  : { title: pushText(lang, 'machineUp', machine.name), body: pushText(lang, 'machineUpBody') });

export function createIncidents({ pusher, prefs, machines, usage, record, now = Date.now }) {
  const machineState = new Map();
  let diskAlertAt = -Infinity;
  const lang = () => prefs.get().lang;

  async function report(title, body) {
    record({ t: now(), kind: 'system', title, body, session: '', machine: '' });
    if (!pusher.hasSubscribers() || !shouldPush(prefs.get(), SYSTEM_KEY, SYSTEM_KEY)) return;
    await pusher.send(title, body, '', '');
  }

  async function checkMachines() {
    for (const alert of machineTransitions(machineState, await machines.list(), now())) {
      const { title, body } = machineAlert(lang(), alert);
      await report(title, body);
    }
  }

  async function checkDisk() {
    const current = await usage();
    if (!diskIsLow(current) || now() - diskAlertAt < DISK_REPEAT_MS) return;
    diskAlertAt = now();
    const free = current.diskFree == null ? '' : pushText(lang(), 'diskFree', (current.diskFree / GIGABYTE).toFixed(1));
    await report(pushText(lang(), 'diskLow'), pushText(lang(), 'diskLowBody', current.disk, free));
  }

  const crashed = () => report(pushText(lang(), 'crashed'), pushText(lang(), 'crashedBody'));
  const ttydRestarted = count => report(pushText(lang(), 'ttyd'), pushText(lang(), 'ttydBody', count));

  return { checkMachines, checkDisk, crashed, ttydRestarted };
}
