import { fail } from '../errors.mjs';
import { graphLayout } from '../git/graph.mjs';
import { GIT_OPS } from '../git/ops.mjs';
import { LOG_FORMAT, parseLog, parseNumstat, parseStatus } from '../git/parse.mjs';
import { git } from '../git/run.mjs';
import { clip } from '../text.mjs';
import { validGitPath, validRev } from '../validate.mjs';

const LOG_LIMIT = '200';
const MAX_OP_OUTPUT = 2000;
const NO_CHANGES = '(không có thay đổi)';
const COMMIT_FORMAT = '%H%x1f%an%x1f%at%x1f%s%x1f%b';
const SECOND_MS = 1000;

const isBranch = name => name && !name.endsWith('/HEAD') && name !== 'origin';

async function fileDiff(dir, file, staged) {
  const text = await git(dir, 'diff', ...(staged ? ['--cached'] : []), '--', file);
  return { text: clip(text) || NO_CHANGES };
}

async function commitMeta(dir, rev) {
  const raw = await git(dir, 'log', '-1', `--format=${COMMIT_FORMAT}`, rev);
  const [hash, author, at, subject, body] = raw.split('\x1f');
  return { hash, author, t: Number(at) * SECOND_MS, subject, body: (body || '').trim() };
}

async function changeDiff(dir, rev) {
  const range = rev ? ['show', '--format=', rev] : ['diff', 'HEAD'];
  const [patch, numstat, commit] = await Promise.all([
    git(dir, ...range, '--patch').catch(() => git(dir, 'diff', '--patch')),
    git(dir, ...range, '--numstat').catch(() => git(dir, 'diff', '--numstat')),
    rev ? commitMeta(dir, rev) : null,
  ]);
  return { text: clip(patch) || NO_CHANGES, files: parseNumstat(numstat), commit };
}

export function gitRoutes({ paths }) {
  return {
    async 'GET /api/git'(query) {
      const dir = await paths.needRepo(query.get('dir'));
      const [status, log, branches] = await Promise.all([
        git(dir, 'status', '--porcelain=v1', '-b', '-z'),
        git(dir, 'log', '--all', '--date-order', '-n', LOG_LIMIT, `--format=${LOG_FORMAT}`).catch(() => ''),
        git(dir, 'branch', '-a', '--format=%(refname:short)').catch(() => ''),
      ]);
      const commits = parseLog(log);
      const graph = graphLayout(commits);
      return { dir, ...parseStatus(status), commits, graph, branches: branches.split('\n').filter(isBranch) };
    },

    async 'GET /api/show'(query) {
      const dir = await paths.needRepo(query.get('dir'));
      const rev = query.get('rev');
      const file = query.get('file');
      if (rev && !validRev(rev)) throw fail(400, 'Mã commit không hợp lệ');
      if (file !== null && !validGitPath(file)) throw fail(400, 'File không hợp lệ');
      if (file) return fileDiff(dir, file, query.get('staged'));
      return changeDiff(dir, rev);
    },

    async 'POST /api/git/op'(_, body) {
      const op = Object.hasOwn(GIT_OPS, body.op) && GIT_OPS[body.op];
      if (!op) throw fail(400, 'Thao tác không hỗ trợ');
      const out = await op(await paths.needRepo(body.dir), body);
      return { ok: true, output: (out || '').trim().slice(0, MAX_OP_OUTPUT) };
    },
  };
}
