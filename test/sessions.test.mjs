import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasCsrfHeader } from '../src/http/guard.mjs';
import { parseQuickItems } from '../src/routes/settings.mjs';
import { agentPanes } from '../src/sessions.mjs';
import { memoryUsedFromMeminfo } from '../src/system.mjs';
import { screenPreview } from '../src/tmux/screen.mjs';

test('panes are linked to the agent running below them', () => {
  const ps = [
    '    1     0 /sbin/init',
    '  100     1 tmux new-session',
    '  200   100 -bash',
    '  300   200 node /usr/lib/node_modules/@openai/codex/bin/codex.js',
    '  400   100 -bash',
    '  500   400 vim notes.txt',
    'garbage',
  ].join('\n');
  const detect = exe => (exe.endsWith('codex.js') ? 'codex' : null);
  const owners = agentPanes(ps, detect);
  assert.deepEqual(owners.get('200'), { agent: 'codex', agentPid: '300' });
  assert.deepEqual(owners.get('100'), { agent: 'codex', agentPid: '300' });
  assert.equal(owners.has('400'), false);
  assert.equal(owners.has('1'), false);
});

test('screen preview keeps the last lines with real content', () => {
  const screen = [
    'first line',
    '╭──────╮',
    '│ text │',
    ' ▐▛███▜▌ logo',
    'second   ',
    '│',
    'third',
    '  ⏵⏵ accept edits on',
    '  ? for shortcuts',
    '',
  ].join('\n');
  assert.equal(screenPreview(screen), '│ text │\nsecond\nthird');
  assert.equal(screenPreview(''), '');
});

test('memory usage from /proc/meminfo', () => {
  assert.equal(memoryUsedFromMeminfo('MemTotal: 1000 kB\nMemAvailable: 305 kB\n'), 70);
  assert.equal(memoryUsedFromMeminfo(''), null);
});

test('quick actions are trimmed and validated', () => {
  const [item] = parseQuickItems([{ emoji: '1234567890', name: 'n'.repeat(50), text: 't', desc: 5 }]);
  assert.deepEqual(item, { emoji: '12345678', name: 'n'.repeat(40), desc: '', text: 't', ask: false });
  assert.throws(() => parseQuickItems(Array(31).fill({ name: 'a', text: 'b' })), error => error.status === 400);
  assert.throws(() => parseQuickItems({}), error => error.status === 400);
});

test('only POST needs the CSRF header', () => {
  assert.ok(hasCsrfHeader({ method: 'GET', headers: {} }));
  assert.ok(hasCsrfHeader({ method: 'POST', headers: { 'x-termi': '1' } }));
  assert.ok(!hasCsrfHeader({ method: 'POST', headers: { 'x-termi': 'yes' } }));
  assert.ok(!hasCsrfHeader({ method: 'POST', headers: {} }));
});
