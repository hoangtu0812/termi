import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);
const MEMORY_PRESSURE_TIMEOUT_MS = 3000;
const PERCENT = 100;

const percentOf = (part, whole) => Math.round(part / whole * PERCENT);
const usedPercent = (free, whole) => Math.round(PERCENT - free / whole * PERCENT);

async function macMemoryUsed() {
  const options = { timeout: MEMORY_PRESSURE_TIMEOUT_MS };
  const result = await run('memory_pressure', [], options).catch(() => ({ stdout: '' }));
  const lastLine = result.stdout.trim().split('\n').pop() || '';
  const free = /(\d+)%/.exec(lastLine);
  return free ? PERCENT - Number(free[1]) : null;
}

export function memoryUsedFromMeminfo(meminfo) {
  const kilobytes = key => Number(new RegExp(`${key}:\\s+(\\d+)`).exec(meminfo)?.[1] || 0);
  const total = kilobytes('MemTotal');
  return total ? usedPercent(kilobytes('MemAvailable'), total) : null;
}

async function memoryUsed() {
  if (process.platform === 'darwin') return macMemoryUsed();
  return memoryUsedFromMeminfo(await fs.readFile('/proc/meminfo', 'utf8').catch(() => ''));
}

export async function machineUsage(home) {
  const cpu = Math.min(PERCENT, percentOf(os.loadavg()[0], os.cpus().length));
  const disk = await fs.statfs(home).catch(() => null);
  return {
    cpu,
    mem: await memoryUsed(),
    memTotal: os.totalmem(),
    disk: disk && usedPercent(disk.bavail, disk.blocks),
    diskFree: disk && disk.bavail * disk.bsize,
  };
}
