const HEAD_SHARE = 0.45;
const NAME_LIMIT = 17;
const LONG_PROJECT = 10;
const PROJECT_PREFIX = 8;
const KINDS = ['waiting', 'working'];

export function midTrunc(text, limit) {
  if (text.length <= limit) return text;
  const head = Math.ceil(limit * HEAD_SHARE);
  return text.slice(0, head) + '…' + text.slice(-(limit - head));
}

export function sessionLabel({ name, dir, title }) {
  if (title) return title;
  const project = dir.split('/').pop() || '';
  const suffix = project && name.startsWith(project) ? name.slice(project.length) : '';
  if (suffix && project.length > LONG_PROJECT) return project.slice(0, PROJECT_PREFIX) + '…' + suffix;
  return midTrunc(name, NAME_LIMIT);
}

export const stateKind = state => (KINDS.includes(state) ? state : 'idle');

export function countByKind(list) {
  const counts = { waiting: 0, working: 0, idle: 0 };
  for (const session of list) counts[stateKind(session.state)]++;
  return counts;
}

export const activeFilter = (wanted, counts) => (counts[wanted] ? wanted : 'all');

export const matchesFilter = (session, filter) => filter === 'all' || stateKind(session.state) === filter;
