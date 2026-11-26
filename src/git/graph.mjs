const TOP = 0;
const DOT = 1;
const BOTTOM = 2;

function firstFreeLane(lanes) {
  const index = lanes.indexOf(null);
  return index < 0 ? lanes.length : index;
}

function trimTrailingFree(lanes) {
  while (lanes.length && lanes.at(-1) == null) lanes.pop();
  return lanes;
}

function placeCommit(lanes, commit) {
  const segments = [];
  const found = lanes.indexOf(commit.h);
  const column = found < 0 ? firstFreeLane(lanes) : found;
  lanes.forEach((hash, lane) => {
    if (hash === commit.h) segments.push([lane, TOP, column, DOT]);
  });
  const next = lanes.map(hash => (hash === commit.h ? null : hash));
  commit.p.forEach((parent, index) => {
    let lane = next.indexOf(parent);
    if (lane < 0) {
      lane = index === 0 ? column : firstFreeLane(next);
      next[lane] = parent;
    }
    segments.push([column, DOT, lane, BOTTOM]);
  });
  lanes.forEach((hash, lane) => {
    if (hash != null && hash !== commit.h) segments.push([lane, TOP, next.indexOf(hash), BOTTOM]);
  });
  return { column, segments, next: trimTrailingFree(next) };
}

export function graphLayout(commits) {
  let lanes = [];
  let width = 1;
  const rows = commits.map(commit => {
    const { column, segments, next } = placeCommit(lanes, commit);
    width = Math.max(width, lanes.length, next.length, column + 1);
    lanes = next;
    return { col: column, seg: segments };
  });
  return { width, rows };
}
