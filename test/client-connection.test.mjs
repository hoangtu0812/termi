import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageLabel, connLevel } from '../public/js/conn.mjs';
import { readOutbox, sendPath } from '../public/js/outbox.mjs';
import { MAX_FRAMES, pickEvictions, poolKey } from '../public/js/term-pool.mjs';

test('terminal pool evicts the least recently used frames but never the active one', () => {
  const entries = [
    { key: 'a', used: 1 },
    { key: 'b', used: 5 },
    { key: 'c', used: 3 },
    { key: 'd', used: 4 },
    { key: 'e', used: 2 },
  ];
  assert.deepEqual(pickEvictions(entries, MAX_FRAMES, 'e'), ['a']);
  assert.deepEqual(pickEvictions(entries, 3, 'a'), ['e', 'c']);
  assert.deepEqual(pickEvictions(entries.slice(0, 2), MAX_FRAMES, 'a'), []);
  assert.notEqual(poolKey('', 'x'), poolKey('pc', 'x'));
});

test('connection level combines network, server and terminal state', () => {
  assert.equal(connLevel({ online: true, server: true, term: 'ok' }), 'ok');
  assert.equal(connLevel({ online: true, server: true, term: 'none' }), 'ok');
  assert.equal(connLevel({ online: true, server: true, term: 'probe' }), 'wait');
  assert.equal(connLevel({ online: true, server: true, term: 'down' }), 'wait');
  assert.equal(connLevel({ online: true, server: false, term: 'ok' }), 'off');
  assert.equal(connLevel({ online: false, server: true, term: 'ok' }), 'off');
});

test('data age is shown in seconds, then minutes', () => {
  assert.equal(ageLabel(0), '');
  assert.equal(ageLabel(10_000, 13_000), 'terminal nhận dữ liệu 3 giây trước');
  assert.equal(ageLabel(0 + 1, 150_001), 'terminal nhận dữ liệu 3 phút trước');
});

test('outbox ignores broken storage and routes to the right machine', () => {
  assert.deepEqual(readOutbox('not json'), []);
  assert.deepEqual(readOutbox('{"a":1}'), []);
  assert.deepEqual(readOutbox('[{"session":"s","text":"hi"},{"text":"no session"},null]'), [
    { session: 's', text: 'hi' },
  ]);
  assert.equal(sendPath(''), '/api/send');
  assert.equal(sendPath('desktop-1'), '/m/desktop-1/api/send');
});
