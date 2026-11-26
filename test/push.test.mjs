import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NOTIFY_DEFAULT, parseNotifyPrefs } from '../src/push/prefs.mjs';
import { createVapidKeys, vapidAuthorization } from '../src/push/vapid.mjs';
import { transitionKind } from '../src/push/watcher.mjs';
import { pushEndpoint } from '../src/push/webpush.mjs';

test('VAPID authorization is a valid ES256 token for the push origin', () => {
  const keys = createVapidKeys();
  const header = vapidAuthorization(keys, 'https://fcm.googleapis.com/fcm/send/abc', 1_000_000);
  const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(key, keys.pub);
  const [head, claims, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const decoded = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.deepEqual(decoded, { aud: 'https://fcm.googleapis.com', exp: 1000 + 43200, sub: 'mailto:termi@example.com' });
  const publicKey = crypto.createPublicKey(crypto.createPrivateKey(keys.priv));
  const signed = Buffer.from(`${head}.${claims}`);
  const verifyKey = { key: publicKey, dsaEncoding: 'ieee-p1363' };
  assert.ok(crypto.verify('sha256', signed, verifyKey, Buffer.from(signature, 'base64url')));
  assert.equal(Buffer.from(keys.pub, 'base64url').length, 65);
});

test('only HTTPS endpoints of known push services are accepted', () => {
  assert.equal(pushEndpoint('https://web.push.apple.com/x').hostname, 'web.push.apple.com');
  const mozilla = 'updates.push.services.mozilla.com';
  assert.equal(pushEndpoint(`https://${mozilla}/x`).hostname, mozilla);
  const refused = ['nope', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com'];
  for (const bad of refused) {
    assert.throws(() => pushEndpoint(bad), error => error.status === 400, bad);
  }
});

test('state transitions that are reported', () => {
  assert.equal(transitionKind('working', 'waiting'), 'waiting');
  assert.equal(transitionKind('idle', 'waiting'), 'waiting');
  assert.equal(transitionKind('waiting', 'waiting'), null);
  assert.equal(transitionKind('working', 'idle'), 'done');
  assert.equal(transitionKind('waiting', 'idle'), null);
  assert.equal(transitionKind('idle', 'working'), null);
});

test('notification settings are normalized', () => {
  assert.deepEqual(parseNotifyPrefs({}), { ...NOTIFY_DEFAULT, waiting: false, done: false });
  const muted = Array.from({ length: 250 }, (_, i) => `/s${i}`);
  assert.equal(parseNotifyPrefs({ muted }).muted.length, 200);
  assert.deepEqual(parseNotifyPrefs({ muted: ['x'.repeat(120), 'ok'] }).muted, ['ok']);
  assert.throws(() => parseNotifyPrefs({ quiet: { to: '7am' } }), error => error.status === 400);
});
