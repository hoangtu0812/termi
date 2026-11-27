import { $, el } from './dom.mjs';
import { go } from './state.mjs';

const HOME = /^\/Users\/[^/]+|^\/home\/[^/]+/;
const SHOWN_LEVELS = 3;

export function crumbParts(dir) {
  const home = HOME.exec(dir)?.[0] ?? '';
  const parts = home ? [['~', home]] : [];
  let acc = home;
  for (const segment of dir.slice(home.length).split('/').filter(Boolean)) {
    acc += '/' + segment;
    parts.push([segment, acc]);
  }
  if (parts.length <= SHOWN_LEVELS + 1) return parts;
  return [['…', parts.at(-SHOWN_LEVELS - 1)[1]], ...parts.slice(-SHOWN_LEVELS)];
}

function crumbButton([label, path], isLast) {
  const b = el('button', isLast ? 'cur' : '', label);
  b.type = 'button';
  b.title = path;
  b.onclick = () => go({ d: path });
  return b;
}

export function renderCrumb(dir) {
  const parts = crumbParts(dir);
  const nodes = parts.flatMap((part, i) => {
    const b = crumbButton(part, i === parts.length - 1);
    return i ? [el('span', 'sep', '/'), b] : [b];
  });
  $('f-crumb').replaceChildren(...nodes);
  $('f-crumb').scrollLeft = $('f-crumb').scrollWidth;
}
