const FIELD = '\x1f';
const RENAME_OR_COPY = new Set(['R', 'C']);
const SUBDIR_MARK = '•';

export const LOG_FORMAT = ['%H', '%P', '%D', '%s', '%an', '%at'].join('%x1f');

function parseEntries(parts) {
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    files.push({ x: entry[0], y: entry[1], path: entry.slice(3) });
    if (RENAME_OR_COPY.has(entry[0])) i++;
  }
  return files;
}

export function parseStatus(raw) {
  const [head = '', ...parts] = raw.split('\0');
  return { head: head.replace(/^## /, ''), files: parseEntries(parts) };
}

const countOrNull = value => (value === '-' ? null : Number(value));

export function parseNumstat(raw) {
  return raw.split('\n').filter(Boolean).map(line => {
    const [added, deleted, ...pathParts] = line.split('\t');
    return { path: pathParts.join('\t'), add: countOrNull(added), del: countOrNull(deleted) };
  });
}

export function parseLog(raw) {
  return raw.split('\n').filter(Boolean).map(line => {
    const [h, parents, refs, s, a, time] = line.split(FIELD);
    return {
      h,
      p: parents ? parents.split(' ') : [],
      refs: refs ? refs.split(', ') : [],
      s,
      a,
      t: Number(time) * 1000,
    };
  });
}

function markCode(file) {
  if (file.x === '?') return 'U';
  return file.x !== ' ' ? file.x : file.y;
}

export function marksFromStatus(raw, rel) {
  const marks = new Map();
  const prefix = rel ? `${rel}/` : '';
  for (const file of parseEntries(raw.split('\0'))) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length).replace(/\/$/, '');
    const slash = rest.indexOf('/');
    if (slash < 0) marks.set(rest, markCode(file));
    else marks.set(rest.slice(0, slash), SUBDIR_MARK);
  }
  return marks;
}
