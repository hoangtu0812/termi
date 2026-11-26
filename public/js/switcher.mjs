import { toast } from './api.mjs';
import { $, STATE, el, wide } from './dom.mjs';
import { agentAvatar } from './icons.mjs';
import { S, cur, go, st } from './state.mjs';

const ordered = () => [...S.list].sort((a, b) => a.name.localeCompare(b.name));
function switchSession(step) {
  const list = ordered(),
    i = list.findIndex(x => x.name === st().s);
  if (list.length < 2 || i < 0) return;
  const next = list[(i + step + list.length) % list.length];
  go({ s: next.name, d: null, g: null, v: null });
  toast(`${next.name} · ${((i + step + list.length) % list.length) + 1}/${list.length}`);
}
export function renderTabs() {
  const show = wide() && S.list.length > 1 && !!cur();
  $('stabs').hidden = !show;
  if (!show) return;
  $('stabs').replaceChildren(
    ...ordered().map(x => {
      const b = el('button', 'stab' + (x.name === st().s ? ' on' : ''));
      b.type = 'button';
      b.append(agentAvatar(x.agent, true), el('span', 'n', x.title || x.name), el('span', 'state st-' + x.state, ''));
      b.lastChild.append(el('span', 'dot'));
      b.title = `${x.name} · ${STATE[x.state] || ''} · ${x.dir}`;
      b.onclick = () => go({ s: x.name, d: null, g: null, v: null });
      return b;
    }),
  );
}
export function setupSwitcher() {
  {
    let x0 = null,
      y0 = 0;
    $('top').addEventListener(
      'touchstart',
      e => {
        if (e.touches.length === 1) {
          x0 = e.touches[0].clientX;
          y0 = e.touches[0].clientY;
        }
      },
      { passive: true },
    );
    $('top').addEventListener(
      'touchend',
      e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0,
          dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 40 && st().s) switchSession(dx < 0 ? 1 : -1);
      },
      { passive: true },
    );
  }
}
