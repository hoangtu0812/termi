import { shouldPush } from './prefs.mjs';

const MAX_EVENTS = 30;
const PEER_TIMEOUT_MS = 4000;

export function transitionKind(previous, state) {
  if (state === 'waiting' && previous !== 'waiting') return 'waiting';
  if (state === 'idle' && previous === 'working') return 'done';
  return null;
}

async function peerSessions(machine) {
  const list = await fetch(`https://${machine.dns}/api/sessions`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS) })
    .then(res => res.json(), () => []);
  return Array.isArray(list) ? list.map(session => ({ ...session, m: machine.id })) : [];
}

export function createWatcher({ sessions, machines, agents, pusher, prefs, now = Date.now }) {
  const previousState = new Map();
  const events = [];

  async function allSessions() {
    const local = (await sessions.list()).map(session => ({ ...session, m: '' }));
    if (!pusher.hasSubscribers()) return local;
    const peers = (await machines.list()).filter(machine => !machine.self && machine.termi);
    const remote = [];
    for (const peer of peers) remote.push(...await peerSessions(peer));
    return [...local, ...remote];
  }

  async function report(session, kind) {
    const label = session.m ? `[${session.m}] ${session.name}` : session.name;
    const action = kind === 'waiting' ? 'cần bạn xác nhận' : 'đã xong';
    const title = `${label}: ${agents.nameOf(session.agent)} ${action}`;
    const event = { t: now(), kind, title, body: session.preview, session: session.name };
    events.unshift({ ...event, machine: session.m, agent: session.agent });
    events.splice(MAX_EVENTS);
    const key = `${session.m}/${session.name}`;
    if (pusher.hasSubscribers() && shouldPush(prefs.get(), kind, key)) {
      await pusher.send(title, session.preview, session.name, session.m);
    }
  }

  async function tick() {
    for (const session of await allSessions()) {
      const key = `${session.m}/${session.name}`;
      const previous = previousState.get(key);
      previousState.set(key, session.state);
      if (previous === undefined) continue;
      const kind = transitionKind(previous, session.state);
      if (kind) await report(session, kind);
    }
  }

  function record(event) {
    events.unshift(event);
    events.splice(MAX_EVENTS);
  }

  return { tick, record, events: () => events };
}
