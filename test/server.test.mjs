import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed, sameOrigin } from '../src/http/guard.mjs';
import { matchPeer } from '../src/machines.mjs';
import { shouldPush } from '../src/push/prefs.mjs';
import { computePending } from '../src/snapshot.mjs';
import { orphanCount } from '../src/ttyd-watchdog.mjs';

test('peer paths', () => {
  const peer = { id: 'desktop-37bc1du', rest: '/api/sessions?x=1' };
  assert.deepEqual(matchPeer('/m/desktop-37bc1du/api/sessions?x=1'), peer);
  assert.deepEqual(matchPeer('/m/Desktop-ABC'), { id: 'desktop-abc', rest: '/' });
  for (const bad of ['/api/m/x', '/m/', '/m/a.b/api', '/m/evil.com/api', '/mx/a/api']) {
    assert.equal(matchPeer(bad), null, bad);
  }
});

test('only the machine owner gets in', () => {
  const owner = ['owner@example.com'];
  const tailnet = { host: 'mac.tail1.ts.net' };
  assert.ok(isAllowed({ ...tailnet, 'tailscale-user-login': 'Owner@Example.com' }, owner));
  assert.ok(!isAllowed({ ...tailnet, 'tailscale-user-login': 'other@example.com' }, owner));
  assert.ok(!isAllowed(tailnet, owner));
  assert.ok(!isAllowed({ ...tailnet, 'tailscale-user-login': 'owner@example.com' }, []));
  assert.ok(isAllowed({ host: '127.0.0.1:7680' }, owner));
});

test('WebSockets accept only the app origin', () => {
  assert.ok(sameOrigin({ host: 'mac.tail1.ts.net', origin: 'https://mac.tail1.ts.net' }));
  assert.ok(sameOrigin({ host: 'mac.tail1.ts.net' }));
  assert.ok(!sameOrigin({ host: 'mac.tail1.ts.net', origin: 'https://evil.com' }));
  assert.ok(!sameOrigin({ host: 'mac.tail1.ts.net', origin: 'https://mac.tail1.ts.net.evil.com' }));
});

test('sessions to restore after a reboot', () => {
  const snap = { at: 1000, sessions: [{ name: 'a' }, { name: 'b' }], pending: [] };
  assert.deepEqual(computePending(snap, new Set(['b']), 2000).map(x => x.name), ['a']);
  assert.deepEqual(computePending(snap, new Set(), Infinity).map(x => x.name), ['a', 'b']);
  assert.deepEqual(computePending(snap, new Set(), 500), []);
  const kept = { at: 3000, sessions: [{ name: 'c' }], pending: [{ name: 'a' }, { name: 'a' }] };
  assert.deepEqual(computePending(kept, new Set(['c']), 500).map(x => x.name), ['a']);
});

test('orphaned tmux clients of ttyd', () => {
  const ps = '  1 100\n100 201\n100 202\n100 203\n 55 204\n';
  assert.equal(orphanCount(ps, '100', new Set(['202'])), 2);
  assert.equal(orphanCount(ps, '100', new Set()), 3);
});

test('notification settings', () => {
  const prefs = { waiting: true, done: false, quiet: { on: true, from: '23:00', to: '07:00' }, muted: ['/x'] };
  const at = hour => new Date(2026, 0, 1, hour, 0);
  assert.ok(shouldPush(prefs, 'waiting', '/a', at(12)));
  assert.ok(!shouldPush(prefs, 'done', '/a', at(12)));
  assert.ok(!shouldPush(prefs, 'waiting', '/x', at(12)));
  assert.ok(!shouldPush(prefs, 'waiting', '/a', at(23)));
  assert.ok(!shouldPush(prefs, 'waiting', '/a', at(3)));
  assert.ok(shouldPush(prefs, 'waiting', '/a', at(7)));
});
