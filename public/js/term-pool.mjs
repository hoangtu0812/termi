export const MAX_FRAMES = 4;

const frames = new Map();
let activeKey = null;

export const poolKey = (machine, name) => `${machine}/${name}`;

export function pickEvictions(entries, max, keep) {
  const others = entries.filter(e => e.key !== keep).sort((a, b) => a.used - b.used);
  return others.slice(0, Math.max(0, entries.length - max)).map(e => e.key);
}

function removeFrame(key) {
  frames.get(key)?.frame.remove();
  frames.delete(key);
}

function createEntry(container, src, onLoad) {
  const frame = document.createElement('iframe');
  frame.className = 'tframe';
  frame.title = 'Terminal';
  const entry = { frame, used: 0, lastData: 0, down: false, term: null };
  frame.addEventListener('load', () => onLoad(entry));
  frame.src = src;
  container.prepend(frame);
  return entry;
}

export function showFrame({ container, key, src, onLoad }) {
  let entry = frames.get(key);
  const created = !entry;
  if (created) {
    entry = createEntry(container, src, onLoad);
    frames.set(key, entry);
  }
  activeKey = key;
  entry.used = Date.now();
  for (const [k, e] of frames) e.frame.hidden = k !== key;
  const listed = [...frames].map(([k, e]) => ({ key: k, used: e.used }));
  for (const old of pickEvictions(listed, MAX_FRAMES, key)) removeFrame(old);
  return { entry, created };
}

export const activeEntry = () => frames.get(activeKey) ?? null;
export const isActive = entry => frames.get(activeKey) === entry;
export const allTerms = () => [...frames.values()].map(e => e.term).filter(Boolean);

export function pruneFrames(machine, liveNames) {
  const live = new Set(liveNames.map(name => poolKey(machine, name)));
  for (const key of [...frames.keys()]) {
    if (key.startsWith(machine + '/') && !live.has(key)) removeFrame(key);
  }
  if (!frames.has(activeKey)) activeKey = null;
}
