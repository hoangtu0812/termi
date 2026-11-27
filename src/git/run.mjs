import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fail } from '../errors.mjs';

const run = promisify(execFile);
const GIT_MAX_BUFFER = 2e7;
const GIT_TIMEOUT_MS = 90_000;
const MAX_ERROR_CHARS = 800;

const gitEnv = () => ({ ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' });

export function git(dir, ...args) {
  const options = { maxBuffer: GIT_MAX_BUFFER, timeout: GIT_TIMEOUT_MS, env: gitEnv() };
  return run('git', ['-C', dir, '-c', 'color.ui=never', ...args], options).then(
    result => result.stdout,
    error => {
      throw fail(400, (error.stderr || error.message).trim().slice(0, MAX_ERROR_CHARS));
    },
  );
}
