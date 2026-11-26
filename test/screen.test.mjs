import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentState, parseChoices, parseMulti, stepsToSubmit } from '../src/tmux/screen.mjs';

const lines = (...rows) => rows.join('\n');

const CLAUDE_CONFIRM = lines(
  'Bash command',
  '  rm -rf build',
  'Do you want to proceed?',
  '❯ 1. Yes',
  '  2. Yes, and don\'t ask again for rm commands',
  '  3. No, and tell Claude what to do differently (esc)',
);

const CODEX_CONFIRM = lines(
  'Would you like to run the following command?',
  '$ npm test',
  '› 1. Yes, proceed',
  '  2. No, and tell Codex what to do differently',
  'Press enter to confirm or esc to cancel',
);

const MULTI_SELECT = lines(
  'Làm những cải tiến nào?',
  '❯ 1. [✔] Chat đầy đủ hơn',
  '     mô tả',
  '  2. [ ] Thao tác nhanh',
  '  3. [✔] Bảng lệnh',
  '  4. [ ] Type something',
  '     Submit',
  '  5. Chat about this',
  'Enter to select',
);

test('agent state from the screen', () => {
  assert.equal(agentState('✻ Thinking… (12s · esc to interrupt)\n❯ \n'), 'working');
  assert.equal(agentState('• Working (4s • esc to interrupt)\n› '), 'working');
  assert.equal(agentState(`${CLAUDE_CONFIRM}\nEsc to cancel`), 'waiting');
  assert.equal(agentState(CODEX_CONFIRM), 'waiting');
  const trust = lines('Trust this folder?', '› 1. Trust and continue', '  2. Back', '  enter continue · esc back');
  assert.equal(agentState(trust), 'waiting');
  assert.equal(agentState('───\n❯ Try "how do I log an error?"\n'), 'idle');
  assert.equal(agentState(''), 'idle');
});

test('single-choice confirmation menus', () => {
  assert.deepEqual(parseChoices(CLAUDE_CONFIRM), {
    question: 'Do you want to proceed?',
    choices: [
      { n: 1, label: 'Yes' },
      { n: 2, label: 'Yes, and don\'t ask again for rm commands' },
      { n: 3, label: 'No, and tell Claude what to do differently (esc)' },
    ],
  });
  assert.equal(parseChoices(CODEX_CONFIRM).choices.length, 2);
  assert.equal(parseChoices(CODEX_CONFIRM).question, 'Would you like to run the following command?');
});

test('numbered lists without a cursor are reply text, not a menu', () => {
  assert.deepEqual(parseChoices('không có lựa chọn nào\n1. dòng lẻ\n3. ba'), {});
  const replyThenMenu = lines(
    '1. Cài agent trong Ubuntu',
    '2. Kiểm tra khi đóng cửa sổ',
    'Review your answers',
    '❯ 1. Submit answers',
    '  2. Cancel',
  );
  assert.deepEqual(parseChoices(replyThenMenu).choices, [{ n: 1, label: 'Submit answers' }, { n: 2, label: 'Cancel' }]);
});

test('menu inside a box', () => {
  assert.deepEqual(parseChoices('│ Continue? │\n│ ❯ 1. Yes │\n│   2. No  │'), {
    question: 'Continue?',
    choices: [{ n: 1, label: 'Yes' }, { n: 2, label: 'No' }],
  });
});

test('multi-select and scrolling menus get no quick buttons', () => {
  assert.deepEqual(parseChoices(MULTI_SELECT), {});
  assert.deepEqual(parseChoices('Pick?\n❯ 1. a\n  2. b\n↓ 3 more lines'), {});
});

test('multi-select options and checked state', () => {
  const menu = parseMulti(MULTI_SELECT);
  assert.equal(menu.multi, true);
  assert.equal(menu.question, 'Làm những cải tiến nào?');
  assert.deepEqual(menu.options.map(o => `${o.n}${o.checked ? '+' : '-'}`), ['1+', '2-', '3+']);
  assert.deepEqual(parseMulti('Do you want?\n❯ 1. Yes\n  2. No'), {});
});

test('steps from the cursor to Submit', () => {
  assert.equal(stepsToSubmit(MULTI_SELECT), 4);
  const onSubmit = MULTI_SELECT.replace('❯ 1.', '  1.').replace('     Submit', '   ❯ Submit');
  assert.equal(stepsToSubmit(onSubmit), 0);
  assert.equal(stepsToSubmit('❯ 1. [ ] a\n  2. [ ] b\n↓ 3 more lines'), null);
});
