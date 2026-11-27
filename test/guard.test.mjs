import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuard, hasToken } from '../src/http/guard.mjs';

const TOKEN = 'a'.repeat(64);
const noUsers = async () => [];
const request = headers => ({ method: 'GET', headers: { host: 'localhost:7680', ...headers } });

test('a token-guarded server accepts only the matching x-termi-token header', async () => {
  assert.equal(hasToken({ 'x-termi-token': TOKEN }, TOKEN), true);
  assert.equal(hasToken({ 'x-termi-token': 'b'.repeat(64) }, TOKEN), false);
  assert.equal(hasToken({}, TOKEN), false);
  const guard = createGuard(noUsers, TOKEN);
  await guard.checkRequest(request({ 'x-termi-token': TOKEN }));
  await assert.rejects(guard.checkRequest(request({})), { status: 403 });
  await assert.rejects(guard.checkRequest(request({ 'x-termi-token': TOKEN, host: 'evil.com' })), { status: 421 });
  assert.equal(await guard.allowsUpgrade(request({ 'x-termi-token': TOKEN })), true);
  assert.equal(await guard.allowsUpgrade(request({ 'tailscale-user-login': 'owner@example.com' })), false);
});

test('without a token the Tailscale identity rule still applies', async () => {
  const guard = createGuard(async () => ['owner@example.com']);
  await guard.checkRequest(request({}));
  await assert.rejects(guard.checkRequest(request({ 'x-termi-token': TOKEN, 'tailscale-user-login': 'x@y.z' })));
});
