import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clip, plainText, prettyModel } from '../src/text.mjs';

test('clip keeps short text and marks truncated text', () => {
  assert.equal(clip('abc', 5), 'abc');
  assert.equal(clip('abcdef', 3), 'abc\n… (đã cắt bớt)');
});

test('markdown to plain text for previews', () => {
  const markdown = '## Xong\n\n**Đã sửa** `server.mjs`:\n- một [link](http://x)\n```js\ncode()\n```\nHết.';
  assert.equal(plainText(markdown), 'Xong Đã sửa server.mjs: một link Hết.');
  assert.equal(plainText('> trích dẫn\n1. một | hai'), 'trích dẫn một hai');
});

test('readable model names', () => {
  assert.equal(prettyModel('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(prettyModel('claude-sonnet-4-5-20250929'), 'Sonnet 4.5');
  assert.equal(prettyModel('claude-haiku-5-5[1m]'), 'Haiku 5.5');
  assert.equal(prettyModel('claude-fable-5-2'), 'Fable 5.2');
  assert.equal(prettyModel('claude-opus-4'), 'Opus 4');
  assert.equal(prettyModel('gpt-5-codex'), 'gpt-5-codex');
  assert.equal(prettyModel(undefined), null);
});
