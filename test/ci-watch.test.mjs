import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCiWatcher, finishedRuns, runAlert } from '../src/push/ci-watch.mjs';
import { NOTIFY_DEFAULT, parseNotifyPrefs } from '../src/push/prefs.mjs';

const run = (id, fields) => ({ id, pipeline: 'Build', title: 'fix login', ref: 'main', ...fields });
const done = (id, result, finishedAt) => run(id, { status: 'completed', result, finishedAt });

test('only runs that finished after the last check, or were seen running, are reported', () => {
  const runs = [
    done('1', 'failure', 50),
    done('2', 'success', 150),
    done('3', 'cancelled', 150),
    done('4', 'failure', 90),
    run('5', { status: 'in_progress', result: null }),
    done('6', 'success', 160),
  ];
  const found = finishedRuns(runs, { since: 100, seen: new Set(['6']), running: new Set(['4']) });
  assert.deepEqual(found.map(item => item.id), ['2', '4']);
});

test('alerts name the pipeline and say where it ran', () => {
  const alert = runAlert('en', { repo: 'o/r' }, done('1', 'failure', 1));
  assert.deepEqual(alert, { kind: 'cifail', title: '❌ Build failed', body: 'o/r · main · fix login' });
  assert.equal(runAlert('vi', { repo: 'o/r' }, done('1', 'success', 1)).title, '✅ Build chạy xong');
});

test('ci alerts are on by default and can be turned off', () => {
  assert.equal(NOTIFY_DEFAULT.ci, true);
  assert.equal(parseNotifyPrefs({}).ci, true);
  assert.equal(parseNotifyPrefs({ ci: false }).ci, false);
});

function fixture({ subscribers = true } = {}) {
  let clock = 1000;
  let runs = [run('7', { status: 'in_progress', result: null })];
  const sent = [];
  const recorded = [];
  const watcher = createCiWatcher({
    sessions: { list: async () => [{ dir: '/repo' }, { dir: '/repo' }, { dir: '' }] },
    ci: { list: async () => ({ repo: 'o/r', runs }) },
    pusher: { hasSubscribers: () => subscribers, send: async (...args) => sent.push(args) },
    prefs: { get: () => ({ ...NOTIFY_DEFAULT, lang: 'en' }) },
    record: event => recorded.push(event),
    now: () => clock,
  });
  const advance = (ms, next) => {
    clock += ms;
    runs = next;
  };
  return { watcher, sent, recorded, advance };
}

test('a run that finishes between checks is pushed once', async () => {
  const { watcher, sent, recorded, advance } = fixture();
  await watcher.tick();
  advance(10, [done('7', 'failure', 900), done('8', 'success', 500)]);
  await watcher.tick();
  await watcher.tick();
  assert.deepEqual(sent, [['❌ Build failed', 'o/r · main · fix login', '', '']]);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].kind, 'cifail');
});

test('nothing is fetched without push subscribers', async () => {
  const { watcher, sent, advance } = fixture({ subscribers: false });
  await watcher.tick();
  advance(10, [done('7', 'failure', 1005)]);
  await watcher.tick();
  assert.deepEqual(sent, []);
});
