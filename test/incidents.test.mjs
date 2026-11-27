import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIncidents, diskIsLow, machineTransitions, OFFLINE_ALERT_MS } from '../src/push/incidents.mjs';
import { NOTIFY_DEFAULT, parseNotifyPrefs } from '../src/push/prefs.mjs';
import { createRunMarker, endedUncleanly } from '../src/run-marker.mjs';

const pc = termi => ({ id: 'pc', name: 'PC', termi });

test('a machine is reported down after five minutes offline and up once it returns', () => {
  const state = new Map();
  assert.deepEqual(machineTransitions(state, [pc(true)], 0), []);
  assert.deepEqual(machineTransitions(state, [pc(false)], 1000), []);
  assert.deepEqual(machineTransitions(state, [pc(false)], 1000 + OFFLINE_ALERT_MS - 1), []);
  assert.deepEqual(machineTransitions(state, [pc(false)], 1000 + OFFLINE_ALERT_MS).map(a => a.kind), ['down']);
  assert.deepEqual(machineTransitions(state, [pc(false)], 2000 + OFFLINE_ALERT_MS), []);
  assert.deepEqual(machineTransitions(state, [pc(true)], 3000 + OFFLINE_ALERT_MS).map(a => a.kind), ['up']);
});

test('short outages, never-seen machines and this machine are not reported', () => {
  const state = new Map();
  machineTransitions(state, [pc(true)], 0);
  machineTransitions(state, [pc(false)], 10);
  assert.deepEqual(machineTransitions(state, [pc(true)], 20), []);
  assert.deepEqual(machineTransitions(new Map(), [pc(false)], OFFLINE_ALERT_MS * 3), []);
  assert.deepEqual(machineTransitions(new Map(), [{ id: '', self: true, termi: false }], 0), []);
});

test('disk is low by percentage or by free space', () => {
  assert.equal(diskIsLow({ disk: 96, diskFree: 50 * 1024 ** 3 }), true);
  assert.equal(diskIsLow({ disk: 80, diskFree: 1024 ** 3 }), true);
  assert.equal(diskIsLow({ disk: 80, diskFree: 50 * 1024 ** 3 }), false);
  assert.equal(diskIsLow(null), false);
});

test('incidents are recorded, pushed when allowed and the disk alert repeats once a day', async () => {
  const sent = [];
  const recorded = [];
  let clock = 0;
  let prefs = { ...NOTIFY_DEFAULT };
  const incidents = createIncidents({
    pusher: { hasSubscribers: () => true, send: async title => sent.push(title) },
    prefs: { get: () => prefs },
    machines: { list: async () => [] },
    usage: async () => ({ disk: 97, diskFree: 1024 ** 3 }),
    record: event => recorded.push(event),
    now: () => clock,
  });
  await incidents.checkDisk();
  await incidents.checkDisk();
  assert.deepEqual(sent, ['Ổ đĩa sắp đầy']);
  clock = 25 * 3_600_000;
  prefs = { ...prefs, system: false };
  await incidents.checkDisk();
  assert.equal(sent.length, 1);
  assert.equal(recorded.length, 2);
  assert.equal(recorded[0].kind, 'system');
});

test('the system preference defaults to on for clients that do not send it', () => {
  assert.equal(NOTIFY_DEFAULT.system, true);
  assert.equal(parseNotifyPrefs({ waiting: true }).system, true);
  assert.equal(parseNotifyPrefs({ system: false }).system, false);
  assert.equal(parseNotifyPrefs({ lang: 'en' }).lang, 'en');
  assert.equal(parseNotifyPrefs({ lang: 'fr' }).lang, 'vi');
});

test('an unclean previous run is detected once', async () => {
  const files = new Map();
  const store = { read: async name => files.get(name) ?? null, write: async (name, value) => files.set(name, value) };
  const marker = createRunMarker(store, () => 1);
  assert.equal(await marker.begin(), false);
  assert.equal(await marker.begin(), true);
  await marker.end();
  assert.equal(await marker.begin(), false);
  assert.equal(endedUncleanly(null), false);
});
