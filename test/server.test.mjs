import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validName, validRev, validHost, validBranch, safeDir, safePath, agentState, AGENTS, parseStatus, graphLayout, matchPeer, transcriptMessages, isAllowed, sameOrigin, marksFromStatus, plainText, parseNumstat, computePending, orphanCount, parseChoices, prettyModel } from '../src/server.mjs';

test('trạng thái agent', () => {
  assert.equal(agentState('✻ Thinking… (12s · esc to interrupt)\n❯ \n'), 'working');
  assert.equal(agentState('Bash command\n rm x\nDo you want to proceed?\n❯ 1. Yes\n  2. No\nEsc to cancel'), 'waiting');
  assert.equal(agentState('───\n❯ Try "how do I log an error?"\n'), 'idle');
  // Codex
  assert.equal(agentState('• Working (4s • esc to interrupt)\n› '), 'working');
  assert.equal(agentState('Trust this folder?\n› 1. Trust and continue\n  2. Back\n  enter continue · esc back'), 'waiting');
  assert.equal(agentState('Would you like to run the following command?\n$ rm -rf build\n› 1. Yes, proceed\nPress enter to confirm or esc to cancel'), 'waiting');
});

test('nhận ra tiến trình agent', () => {
  const who = c => Object.keys(AGENTS).find(id => AGENTS[id].proc(c));
  assert.equal(who('/Users/a/.local/share/claude/versions/2.1.332'), 'claude');
  assert.equal(who('/Users/a/.local/bin/codex'), 'codex');
  assert.equal(who('/usr/lib/node_modules/@openai/codex/bin/codex.js'), 'codex'); // Linux, cài qua npm
  assert.equal(who('/opt/homebrew/bin/agy'), 'agy');
  assert.equal(who('/Applications/Claude.app/Contents/MacOS/Claude'), undefined);
  assert.equal(who('/bin/zsh'), undefined);
});

test('git status -z', () => {
  const r = parseStatus('## main...origin/main [ahead 1]\0M  a b.txt\0R  new.js\0old.js\0?? x\0');
  assert.equal(r.head, 'main...origin/main [ahead 1]');
  assert.deepEqual(r.files.map(f => f.x + f.y + f.path), ['M a b.txt', 'R new.js', '??x']);
});

test('tên branch', () => {
  for (const ok of ['main', 'feat/x-1', 'origin/dev']) assert.ok(validBranch(ok), ok);
  for (const bad of ['-f', '--force', 'a..b', 'a b', '']) assert.ok(!validBranch(bad), bad);
});

test('safePath file', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'termi-')));
  await fs.writeFile(path.join(root, 'f.txt'), 'x');
  assert.equal(await safePath(path.join(root, 'f.txt'), 'file', [root]), path.join(root, 'f.txt'));
  assert.equal(await safePath(root, 'file', [root]), null);
  assert.equal(await safePath('/etc/hosts', 'file', [root]), null);
});

test('tên phiên', () => {
  for (const ok of ['main', 'my-proj_2']) assert.ok(validName(ok), ok);
  for (const bad of ['', 'a b', 'x;rm', 'a:b', 'a.b', '-'.repeat(41), 1]) assert.ok(!validName(bad), String(bad));
});

test('mã commit', () => {
  assert.ok(validRev('abc1234'));
  for (const bad of ['HEAD', '--output=x', 'abc', 'abc123g']) assert.ok(!validRev(bad), bad);
});

test('host', () => {
  for (const ok of ['localhost:7680', '127.0.0.1', 'tus-mac-mini.tail1234.ts.net']) assert.ok(validHost(ok), ok);
  for (const bad of ['evil.com', 'ts.net.evil.com', 'a.ts.net.evil.com:80', undefined]) assert.ok(!validHost(bad), String(bad));
});

test('thư mục nằm trong roots', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'termi-')));
  await fs.mkdir(path.join(root, 'a'));
  await fs.mkdir(`${root}-evil`);
  assert.equal(await safeDir(path.join(root, 'a'), [root]), path.join(root, 'a'));
  assert.equal(await safeDir(path.join(root, 'a', '..', '..'), [root]), null);
  assert.equal(await safeDir(`${root}-evil`, [root]), null); // tiền tố trùng nhưng khác thư mục
  assert.equal(await safeDir(path.join(root, 'none'), [root]), null);
  await fs.symlink('/', path.join(root, 'link'));
  assert.equal(await safeDir(path.join(root, 'link'), [root]), null); // symlink thoát ra ngoài
});

test('xếp làn cây commit: rẽ nhánh rồi merge', () => {
  // M merge A và B, cả hai cùng gốc C
  const g = graphLayout([
    { h: 'M', p: ['A', 'B'] }, { h: 'A', p: ['C'] }, { h: 'B', p: ['C'] }, { h: 'C', p: [] },
  ]);
  assert.equal(g.width, 2);
  assert.deepEqual(g.rows.map(r => r.col), [0, 0, 1, 0]);
  assert.deepEqual(g.rows[0].seg, [[0, 1, 0, 2], [0, 1, 1, 2]]);             // M tách ra 2 làn
  assert.deepEqual(g.rows[1].seg, [[0, 0, 0, 1], [0, 1, 0, 2], [1, 0, 1, 2]]); // A thẳng, làn B chạy qua
  assert.deepEqual(g.rows[2].seg, [[1, 0, 1, 1], [1, 1, 0, 2], [0, 0, 0, 2]]); // B nhập về làn của C
  assert.deepEqual(g.rows[3].seg, [[0, 0, 0, 1]]);                           // C là gốc, không đi tiếp
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

test('đánh dấu git trong tab File', () => {
  const raw = ' M src/server.mjs\0?? docs/new.md\0A  README.md\0M  src/sub/deep.js\0';
  assert.deepEqual(Object.fromEntries(marksFromStatus(raw, '')), { src: '•', docs: '•', 'README.md': 'A' });
  assert.deepEqual(Object.fromEntries(marksFromStatus(raw, 'src')), { 'server.mjs': 'M', sub: '•' });
  assert.deepEqual(Object.fromEntries(marksFromStatus('?? newdir/\0', '')), { newdir: 'U' });
});

test('bỏ markdown cho xem trước', () => {
  assert.equal(plainText('## Xong\n\n**Đã sửa** `server.mjs`:\n- một [link](http://x)\n```js\ncode()\n```\nHết.'), 'Xong Đã sửa server.mjs: một link Hết.');
});

test('git --numstat', () => {
  assert.deepEqual(parseNumstat('12\t3\tsrc/a.js\n-\t-\tlogo.png\n'), [
    { path: 'src/a.js', add: 12, del: 3 }, { path: 'logo.png', add: null, del: null }]);
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

test('đọc lựa chọn khi agent chờ xác nhận', () => {
  const claude = 'Bash command\n  rm -rf build\nDo you want to proceed?\n❯ 1. Yes\n  2. Yes, and don\'t ask again for rm commands\n  3. No, and tell Claude what to do differently (esc)\n';
  assert.deepEqual(parseChoices(claude), { question: 'Do you want to proceed?', choices: [
    { n: 1, label: 'Yes' }, { n: 2, label: "Yes, and don't ask again for rm commands" }, { n: 3, label: 'No, and tell Claude what to do differently (esc)' }] });
  const codex = 'Would you like to run the following command?\n$ npm test\n› 1. Yes, proceed\n  2. No, and tell Codex what to do differently\nPress enter to confirm or esc to cancel';
  assert.equal(parseChoices(codex).choices.length, 2);
  assert.equal(parseChoices(codex).question, 'Would you like to run the following command?');
  assert.deepEqual(parseChoices('không có lựa chọn nào\n1. dòng lẻ không bắt đầu từ menu\n3. ba'), { question: null, choices: [{ n: 1, label: 'dòng lẻ không bắt đầu từ menu' }] });
});

test('tên model dễ đọc', () => {
  assert.equal(prettyModel('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(prettyModel('claude-sonnet-4-5-20250929'), 'Sonnet 4.5');
  assert.equal(prettyModel('claude-haiku-5-5[1m]'), 'Haiku 5.5');
  assert.equal(prettyModel('claude-fable-5-2'), 'Fable 5.2');
  assert.equal(prettyModel('gpt-5-codex'), 'gpt-5-codex');
  assert.equal(prettyModel(undefined), null);
});
