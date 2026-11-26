import { fail } from '../errors.mjs';
import { validBranch, validGitPath } from '../validate.mjs';
import { git } from './run.mjs';

const MAX_COMMIT_MESSAGE = 5000;

const isMissingHead = error => /resolve 'HEAD'/.test(error.message);
const isMissingUpstream = error => /no upstream/i.test(error.message);

function requirePaths({ paths }) {
  if (!Array.isArray(paths) || !paths.length || !paths.every(validGitPath)) {
    throw fail(400, 'Danh sách file không hợp lệ');
  }
  return paths;
}

async function unstage(dir, body) {
  const paths = requirePaths(body);
  try {
    return await git(dir, 'restore', '--staged', '--', ...paths);
  } catch (error) {
    if (!isMissingHead(error)) throw error;
    return git(dir, 'rm', '--cached', '-r', '-q', '--', ...paths);
  }
}

function commit(dir, { message }) {
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_COMMIT_MESSAGE) {
    throw fail(400, 'Cần nội dung commit');
  }
  return git(dir, 'commit', '-m', message);
}

async function push(dir) {
  try {
    return await git(dir, 'push');
  } catch (error) {
    if (!isMissingUpstream(error)) throw error;
    return git(dir, 'push', '-u', 'origin', 'HEAD');
  }
}

function checkout(dir, { branch }) {
  if (!validBranch(branch)) throw fail(400, 'Tên branch không hợp lệ');
  return git(dir, 'switch', branch.replace(/^origin\//, ''));
}

export const GIT_OPS = {
  stage: (dir, body) => git(dir, 'add', '--', ...requirePaths(body)),
  unstage,
  commit,
  push,
  pull: dir => git(dir, 'pull', '--ff-only'),
  fetch: dir => git(dir, 'fetch', '--all', '--prune'),
  checkout,
};
