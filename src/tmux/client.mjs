import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TMUX_MAX_BUFFER = 4e6;

export const tmux = (...args) => run('tmux', args, { maxBuffer: TMUX_MAX_BUFFER });

export const target = name => `=${name}:`;

export function serverStartTime() {
  return tmux('display-message', '-p', '#{start_time}').then(
    result => Number(result.stdout) * 1000 || Infinity,
    () => Infinity,
  );
}
