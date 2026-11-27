import { shouldPush } from './prefs.mjs';
import { pushText } from './texts.mjs';

export const CI_WATCH_MS = 2 * 60_000;
const PREF_KEY = 'ci';
const NOTIFIED_RESULTS = { success: 'cidone', failure: 'cifail' };
const MAX_REMEMBERED = 500;

export function finishedRuns(runs, { since, seen, running }) {
  return (runs || []).filter(run => run.status === 'completed'
    && NOTIFIED_RESULTS[run.result]
    && (run.finishedAt > since || running.has(run.id))
    && !seen.has(run.id));
}

export function runAlert(lang, data, run) {
  const kind = NOTIFIED_RESULTS[run.result];
  const title = pushText(lang, kind, run.pipeline || run.title);
  const where = [data.repo, run.ref, run.title].filter(Boolean).join(' · ');
  return { kind, title, body: where };
}

function remember(set, id) {
  set.add(id);
  if (set.size > MAX_REMEMBERED) set.delete(set.values().next().value);
}

function trackRunning(running, runs) {
  for (const run of runs) {
    if (run.status === 'completed') running.delete(run.id);
    else remember(running, run.id);
  }
}

export function createCiWatcher({ sessions, ci, pusher, prefs, record, now = Date.now }) {
  const since = new Map();
  const seen = new Set();
  const running = new Set();

  async function checkDir(dir) {
    const data = await ci.list(dir).catch(() => null);
    const checkedAt = now();
    const previous = since.get(dir);
    since.set(dir, checkedAt);
    if (!data?.runs) return;
    const finished = previous === undefined ? [] : finishedRuns(data.runs, { since: previous, seen, running });
    trackRunning(running, data.runs);
    for (const run of finished) {
      remember(seen, run.id);
      const { kind, title, body } = runAlert(prefs.get().lang, data, run);
      record({ t: checkedAt, kind, title, body, session: '', machine: '' });
      if (shouldPush(prefs.get(), PREF_KEY, PREF_KEY)) await pusher.send(title, body, '', '');
    }
  }

  async function tick() {
    if (!pusher.hasSubscribers() || !prefs.get()[PREF_KEY]) return;
    const dirs = new Set((await sessions.list()).map(session => session.dir).filter(Boolean));
    for (const dir of dirs) await checkDir(dir);
  }

  return { tick };
}
