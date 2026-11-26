import { fail } from './errors.mjs';
import { git } from './git/run.mjs';
import { safePath } from './validate.mjs';

const OUTSIDE_ROOTS = 'Đường dẫn không hợp lệ hoặc nằm ngoài TERMI_ROOTS';

export function createPaths(roots) {
  const inside = (candidate, kind = 'dir') => safePath(candidate, kind, roots);

  async function need(candidate, kind = 'dir') {
    const resolved = await inside(candidate, kind);
    if (!resolved) throw fail(403, OUTSIDE_ROOTS);
    return resolved;
  }

  async function needRepo(dir) {
    const resolved = await need(dir);
    return (await git(resolved, 'rev-parse', '--show-toplevel')).trim();
  }

  return { roots, inside, need, needRepo };
}
