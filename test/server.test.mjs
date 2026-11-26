import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  AGENTS, matchPeer, transcriptMessages, isAllowed, sameOrigin, computePending, orphanCount, chatItems,
  toolSummary, shouldPush,
} from '../src/app.mjs';

test('nhận ra tiến trình agent', () => {
  const who = c => Object.keys(AGENTS).find(id => AGENTS[id].proc(c));
  assert.equal(who('/Users/a/.local/share/claude/versions/2.1.332'), 'claude');
  assert.equal(who('/Users/a/.local/bin/codex'), 'codex');
  assert.equal(who('/usr/lib/node_modules/@openai/codex/bin/codex.js'), 'codex'); // Linux, cài qua npm
  assert.equal(who('/opt/homebrew/bin/agy'), 'agy');
  assert.equal(who('/Applications/Claude.app/Contents/MacOS/Claude'), undefined);
  assert.equal(who('/bin/zsh'), undefined);
});

test('index.html: không có </script> lọt trong code JS (sẽ cắt ngang thẻ script)', async () => {
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.equal(html.match(/<\/script>/gi).length, html.match(/^<script[\s>]/gim).length); // thẻ thật đứng đầu dòng
});

test('đường dẫn sang máy khác', () => {
  assert.deepEqual(matchPeer('/m/desktop-37bc1du/api/sessions?x=1'), { id: 'desktop-37bc1du', rest: '/api/sessions?x=1' });
  assert.deepEqual(matchPeer('/m/Desktop-ABC'), { id: 'desktop-abc', rest: '/' });
  for (const bad of ['/api/m/x', '/m/', '/m/a.b/api', '/m/evil.com/api', '/mx/a/api']) assert.equal(matchPeer(bad), null, bad);
});

test('tin nhắn từ file hội thoại', () => {
  const claude = [
    { type: 'user', message: { content: 'sửa lỗi đăng nhập' } },
    { type: 'user', isMeta: true, message: { content: 'meta' } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } },
    { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'Đã sửa.' }] } },
  ].map(o => JSON.stringify(o)).reverse();
  assert.deepEqual(transcriptMessages('claude', claude), [{ who: 'user', text: 'sửa lỗi đăng nhập', t: null }, { who: 'assistant', text: 'Đã sửa.', t: null }]);
  const codex = [
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md ...' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'chạy test' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '12 test qua' }] } },
  ].map(o => JSON.stringify(o)).reverse();
  assert.deepEqual(transcriptMessages('codex', codex), [{ who: 'user', text: 'chạy test', t: null }, { who: 'assistant', text: '12 test qua', t: null }]);
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

test('Chat: tin nhắn + các bước agent làm', () => {
  const lines = [
    { type: 'user', message: { content: 'chạy test giúp tôi' }, timestamp: '2026-11-26T10:00:00Z' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Để tôi chạy.' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test', description: 'Chạy test' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a/b/server.mjs' } }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '22 test qua.' }] } },
  ].map(o => JSON.stringify(o)).reverse();
  const items = chatItems('claude', lines);
  assert.deepEqual(items.map(x => x.kind === 'tools' ? x.steps.map(s => s.verb + ' ' + s.detail) : x.who + ': ' + x.text), [
    'user: chạy test giúp tôi', 'assistant: Để tôi chạy.', ['Chạy Chạy test', 'Đọc server.mjs'], 'assistant: 22 test qua.']);
  assert.deepEqual(toolSummary('exec', 'const r = await tools.exec_command({cmd:"rg -n TODO src"})'), { verb: 'Chạy', detail: 'rg -n TODO src' });
  assert.deepEqual(toolSummary('Edit', { file_path: '/x/y/index.html' }), { verb: 'Sửa', detail: 'index.html' });
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
