import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmux } from './tmux/client.mjs';

const run = promisify(execFile);
const PS_MAX_BUFFER = 8e6;
const IDLE_ORPHAN_LIMIT = 20;
const BUSY_ORPHAN_LIMIT = 150;
const LAUNCHD_LABEL = 'vn.termi.ttyd';
const SYSTEMD_UNIT = 'termi-ttyd';

export function orphanCount(psOut, ttydPid, attachedPids) {
  const rows = psOut.split('\n').map(line => line.trim().split(/\s+/));
  return rows.filter(([ppid, pid]) => ppid === ttydPid && !attachedPids.has(pid)).length;
}

const stdoutOrEmpty = promise => promise.then(result => result.stdout, () => '');

function restartTtyd() {
  if (process.platform === 'darwin') {
    return run('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${LAUNCHD_LABEL}`]);
  }
  return run('systemctl', ['--user', 'restart', SYSTEMD_UNIT]);
}

export function createTtydWatchdog(ttydPort) {
  return async function checkTtyd() {
    const pid = (await stdoutOrEmpty(run('pgrep', ['-f', `ttyd .*-p ${ttydPort}`]))).trim().split('\n')[0];
    if (!pid) return;
    const clients = await stdoutOrEmpty(tmux('list-clients', '-F', '#{client_pid}'));
    const attached = new Set(clients.split('\n').filter(Boolean));
    const ps = await run('ps', ['-A', '-o', 'ppid=,pid='], { maxBuffer: PS_MAX_BUFFER });
    const orphans = orphanCount(ps.stdout, pid, attached);
    if (orphans < IDLE_ORPHAN_LIMIT || (attached.size && orphans < BUSY_ORPHAN_LIMIT)) return;
    console.log(`ttyd: ${orphans} stuck clients, ${attached.size} in use; restarting ttyd`);
    await restartTtyd();
  };
}
