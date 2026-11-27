import path from 'node:path';
import { marksFromStatus } from './parse.mjs';
import { git } from './run.mjs';

export async function gitMarks(dir) {
  try {
    const top = (await git(dir, 'rev-parse', '--show-toplevel')).trim();
    const raw = await git(top, 'status', '--porcelain=v1', '-z', '--untracked-files=normal');
    return marksFromStatus(raw, path.relative(top, dir));
  } catch {
    return new Map();
  }
}
