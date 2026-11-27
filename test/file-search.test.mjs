import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankMatches, walkFiles } from '../src/file-search.mjs';

const entry = (name, dir = false) => ({ name, isDirectory: () => dir });

test('file name matches rank before path matches, shorter first', () => {
  const files = ['src/server/index.mjs', 'server.mjs', 'docs/._server.md', 'test/server.test.mjs', 'readme.md'];
  assert.deepEqual(rankMatches(files, 'SERVER'), ['server.mjs', 'test/server.test.mjs', 'src/server/index.mjs']);
  assert.deepEqual(rankMatches(files, 'server', 1), ['server.mjs']);
});

test('walking skips hidden entries and node_modules', async () => {
  const tree = {
    '/r': [entry('a.txt'), entry('.git', true), entry('node_modules', true), entry('lib', true)],
    '/r/lib': [entry('b.mjs'), entry('.env')],
  };
  const readdir = async dir => tree[dir] ?? [];
  assert.deepEqual(await walkFiles('/r', readdir), ['a.txt', 'lib/b.mjs']);
});
