import { shouldPush } from './prefs.mjs';

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

const machineAlert = ({ kind, machine }) => (kind === 'down'
  ? { title: `Máy ${machine.name} mất kết nối`, body: 'termi trên máy này không trả lời quá 5 phút.' }
  : { title: `Máy ${machine.name} đã kết nối lại`, body: 'termi trên máy này đã trả lời trở lại.' });

export function createIncidents({ pusher, prefs, machines, usage, record, now = Date.now }) {
  const machineState = new Map();
  let diskAlertAt = -Infinity;

  async function report(title, body) {
    record({ t: now(), kind: 'system', title, body, session: '', machine: '' });
    if (!pusher.hasSubscribers() || !shouldPush(prefs.get(), SYSTEM_KEY, SYSTEM_KEY)) return;
    await pusher.send(title, body, '', '');
  }

  async function checkMachines() {
    for (const alert of machineTransitions(machineState, await machines.list(), now())) {
      const { title, body } = machineAlert(alert);
      await report(title, body);
    }
  }

  async function checkDisk() {
    const current = await usage();
    if (!diskIsLow(current) || now() - diskAlertAt < DISK_REPEAT_MS) return;
    diskAlertAt = now();
    const free = current.diskFree == null ? '' : `, còn trống ${(current.diskFree / GIGABYTE).toFixed(1)} GB`;
    await report('Ổ đĩa sắp đầy', `Ổ chứa thư mục nhà đã dùng ${current.disk}%${free}.`);
  }

  const crashed = () => report('termi đã tự khởi động lại', 'Máy chủ termi dừng bất thường và vừa được chạy lại.');
  const ttydRestarted = count => report('Terminal được khởi động lại', `ttyd bị kẹt ${count} kết nối nên đã chạy lại.`);

  return { checkMachines, checkDisk, crashed, ttydRestarted };
}
