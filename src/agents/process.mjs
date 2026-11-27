import path from 'node:path';

const SCRIPT_RUNTIMES = /^(node|bun|deno)$/;

export const binaryName = executable => path.basename(executable).replace(/\.[cm]?js$/, '');

export function executableOf(commandLine) {
  const args = commandLine.split(/\s+/);
  return SCRIPT_RUNTIMES.test(path.basename(args[0])) ? args[1] || '' : args[0];
}
