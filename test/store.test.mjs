import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore, CorruptFileError } from '../src/store.mjs';

async function tempStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'termi-store-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const logged = [];
  const store = createStore(dir, { log: { error: message => logged.push(message) } });
  return { dir, store, logged };
}

test('write then read returns the value with owner-only permissions', async t => {
  const { dir, store } = await tempStore(t);
  await store.write('a.json', { n: 1, list: ['x'] });
  assert.deepEqual(await store.read('a.json'), { n: 1, list: ['x'] });
  assert.equal((await fs.stat(path.join(dir, 'a.json'))).mode & 0o777, 0o600);
  assert.deepEqual(await fs.readdir(dir), ['a.json']);
});

test('a missing file reads as null', async t => {
  const { store } = await tempStore(t);
  assert.equal(await store.read('none.json'), null);
  assert.equal(await store.read('none.json', { strict: true }), null);
});

test('concurrent updates are serialized and none is lost', async t => {
  const { store } = await tempStore(t);
  await Promise.all(Array.from({ length: 50 }, () => store.update('count.json', n => (n ?? 0) + 1)));
  assert.equal(await store.read('count.json'), 50);
});

test('writes to the same file land in call order', async t => {
  const { store } = await tempStore(t);
  await Promise.all([store.write('o.json', 1), store.write('o.json', 2), store.write('o.json', 3)]);
  assert.equal(await store.read('o.json'), 3);
});

test('a failed update leaves the file unchanged and does not block the queue', async t => {
  const { store } = await tempStore(t);
  await store.write('f.json', { ok: true });
  await assert.rejects(store.update('f.json', () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(await store.read('f.json'), { ok: true });
  assert.equal(await store.update('f.json', v => ({ ...v, next: 1 })).then(v => v.next), 1);
});

test('strict read of a corrupt file throws and keeps the file', async t => {
  const { dir, store } = await tempStore(t);
  await fs.writeFile(path.join(dir, 'vapid.json'), '{"pub": "abc"');
  await assert.rejects(store.read('vapid.json', { strict: true }), CorruptFileError);
  assert.equal(await fs.readFile(path.join(dir, 'vapid.json'), 'utf8'), '{"pub": "abc"');
});

test('lenient read of a corrupt file moves it aside and reports it', async t => {
  const { dir, store, logged } = await tempStore(t);
  await fs.writeFile(path.join(dir, 'subs.json'), '[{"endpoint"');
  assert.equal(await store.read('subs.json'), null);
  const files = await fs.readdir(dir);
  assert.ok(!files.includes('subs.json'));
  assert.ok(files.some(f => f.startsWith('subs.json.corrupt-')));
  assert.equal(logged.length, 1);
});

test('remove deletes the file and tolerates a missing one', async t => {
  const { dir, store } = await tempStore(t);
  await store.write('q.json', []);
  await store.remove('q.json');
  await store.remove('q.json');
  assert.deepEqual(await fs.readdir(dir), []);
});
