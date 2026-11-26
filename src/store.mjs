import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE_MODE = 0o600;

export class CorruptFileError extends Error {
  constructor(file, cause) {
    super(`${file} is not valid JSON; fix or remove it`, { cause });
    this.name = 'CorruptFileError';
    this.file = file;
  }
}

export async function writeFileAtomic(file, text) {
  const temp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    const handle = await fs.open(temp, 'wx', FILE_MODE);
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

async function readJsonFile(file) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { missing: true };
    throw error;
  }
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { corrupt: new CorruptFileError(file, error) };
  }
}

function createQueue() {
  const tails = new Map();
  return (key, task) => {
    const result = (tails.get(key) || Promise.resolve()).then(task);
    const tail = result.catch(() => {});
    tails.set(key, tail);
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}

export function createStore(dir, { log = console } = {}) {
  const serialize = createQueue();
  const fileOf = name => path.join(dir, name);

  async function quarantine(name, error) {
    const target = `${fileOf(name)}.corrupt-${Date.now()}`;
    await fs.rename(fileOf(name), target).catch(() => {});
    log.error(`store: ${error.message}; moved to ${path.basename(target)}`);
  }

  async function read(name, { strict = false } = {}) {
    const result = await readJsonFile(fileOf(name));
    if (result.missing) return null;
    if (!result.corrupt) return result.value;
    if (strict) throw result.corrupt;
    await quarantine(name, result.corrupt);
    return null;
  }

  const write = (name, value) => serialize(name, () => writeFileAtomic(fileOf(name), JSON.stringify(value)));

  const update = (name, change) => serialize(name, async () => {
    const next = await change(await read(name));
    await writeFileAtomic(fileOf(name), JSON.stringify(next));
    return next;
  });

  const remove = name => serialize(name, () => fs.rm(fileOf(name), { force: true }));

  return { read, write, update, remove };
}
