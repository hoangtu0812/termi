import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  matchPeer, isAllowed, sameOrigin, computePending, orphanCount, shouldPush,
} from '../src/app.mjs';

test('index.html: không có </script> lọt trong code JS (sẽ cắt ngang thẻ script)', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.equal(html.match(/<\/script>/gi).length, html.match(/^<script[\s>]/gim).length); // thẻ thật đứng đầu dòng
});

test('đường dẫn sang máy khác', () => {
  assert.deepEqual(matchPeer('/m/desktop-37bc1du/api/sessions?x=1'), { id: 'desktop-37bc1du', rest: '/api/sessions?x=1' });
  assert.deepEqual(matchPeer('/m/Desktop-ABC'), { id: 'desktop-abc', rest: '/' });
  for (const bad of ['/api/m/x', '/m/', '/m/a.b/api', '/m/evil.com/api', '/mx/a/api']) assert.equal(matchPeer(bad), null, bad);
});

test('chỉ chủ máy được vào', () => {
  const owner = ['chu@may.com'];
  assert.ok(isAllowed({ host: 'may.tail1.ts.net', 'tailscale-user-login': 'Chu@May.com' }, owner));
  assert.ok(!isAllowed({ host: 'may.tail1.ts.net', 'tailscale-user-login': 'khac@x.com' }, owner));
  assert.ok(!isAllowed({ host: 'may.tail1.ts.net' }, owner)); // thiết bị gắn tag / Funnel: không có danh tính
  assert.ok(!isAllowed({ host: 'may.tail1.ts.net', 'tailscale-user-login': 'chu@may.com' }, [])); // không biết chủ máy: chặn
  assert.ok(isAllowed({ host: '127.0.0.1:7680' }, owner)); // gọi thẳng trên máy này
});

test('WebSocket chỉ nhận Origin của chính app', () => {
  assert.ok(sameOrigin({ host: 'may.tail1.ts.net', origin: 'https://may.tail1.ts.net' }));
  assert.ok(sameOrigin({ host: 'may.tail1.ts.net' }));
  assert.ok(!sameOrigin({ host: 'may.tail1.ts.net', origin: 'https://evil.com' }));
  assert.ok(!sameOrigin({ host: 'may.tail1.ts.net', origin: 'https://may.tail1.ts.net.evil.com' }));
});

test('khôi phục phiên sau khi khởi động lại', () => {
  const snap = { at: 1000, sessions: [{ name: 'a' }, { name: 'b' }], pending: [] };
  // tmux khởi động lại sau lần lưu cuối: mọi phiên đã lưu (trừ phiên đang có) chờ khôi phục
  assert.deepEqual(computePending(snap, new Set(['b']), 2000).map(x => x.name), ['a']);
  assert.deepEqual(computePending(snap, new Set(), Infinity).map(x => x.name), ['a', 'b']); // chưa có tmux server
  // tmux vẫn chạy từ trước lần lưu: không có gì để khôi phục
  assert.deepEqual(computePending(snap, new Set(), 500), []);
  // phần chờ khôi phục được giữ qua các lần lưu, không trùng
  assert.deepEqual(computePending({ at: 3000, sessions: [{ name: 'c' }], pending: [{ name: 'a' }, { name: 'a' }] }, new Set(['c']), 500).map(x => x.name), ['a']);
});

test('đếm client tmux mồ côi của ttyd', () => {
  const ps = '  1 100\n100 201\n100 202\n100 203\n 55 204\n';
  assert.equal(orphanCount(ps, '100', new Set(['202'])), 2); // 201, 203 mồ côi; 202 đang gắn; 204 con của tiến trình khác
  assert.equal(orphanCount(ps, '100', new Set()), 3);
});

test('tuỳ chỉnh thông báo', () => {
  const p = { waiting: true, done: false, quiet: { on: true, from: '23:00', to: '07:00' }, muted: ['/x'] };
  const at = h => new Date(2026, 0, 1, h, 0);
  assert.ok(shouldPush(p, 'waiting', '/a', at(12)));
  assert.ok(!shouldPush(p, 'done', '/a', at(12)));   // loại không bật
  assert.ok(!shouldPush(p, 'waiting', '/x', at(12))); // phiên bị tắt
  assert.ok(!shouldPush(p, 'waiting', '/a', at(23))); // giờ yên lặng qua nửa đêm
  assert.ok(!shouldPush(p, 'waiting', '/a', at(3)));
  assert.ok(shouldPush(p, 'waiting', '/a', at(7)));
});
