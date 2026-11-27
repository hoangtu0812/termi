import { serverStartTime } from './tmux/client.mjs';

const FILE = 'sessions.json';

export const normalizeSnapshot = saved => ({
  at: saved?.at || 0,
  sessions: Array.isArray(saved?.sessions) ? saved.sessions : [],
  pending: Array.isArray(saved?.pending) ? saved.pending : [],
});

export function computePending(snap, present, serverStart) {
  const lost = serverStart > snap.at ? snap.sessions : [];
  const seen = new Set();
  const isNew = item => !present.has(item.name) && !seen.has(item.name) && seen.add(item.name);
  return [...snap.pending, ...lost].filter(isNew);
}

export function createSnapshots({ store, sessions, now = Date.now }) {
  const read = async () => normalizeSnapshot(await store.read(FILE));
  const update = change => store.update(FILE, saved => change(normalizeSnapshot(saved)));
  const names = list => new Set(list.map(item => item.name));

  async function pending() {
    const [snap, list, start] = await Promise.all([read(), sessions.list(), serverStartTime()]);
    return computePending(snap, names(list), start);
  }

  async function save() {
    const list = await sessions.list();
    if (!list.length) return;
    const serverStart = await serverStartTime();
    const current = await Promise.all(list.map(async session => ({
      name: session.name,
      dir: session.dir,
      agent: session.agent,
      resume: await sessions.resumeId(session).catch(() => null),
    })));
    await update(snap => ({ at: now(), sessions: current, pending: computePending(snap, names(list), serverStart) }));
  }

  function forget(name) {
    const keep = item => item.name !== name;
    return update(snap => ({ ...snap, sessions: snap.sessions.filter(keep), pending: snap.pending.filter(keep) }));
  }

  const dismiss = () => update(snap => ({ ...snap, pending: [] }));

  return { pending, save, forget, dismiss };
}
