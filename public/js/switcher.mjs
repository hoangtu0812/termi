import { toast } from './api.mjs';
import { $ } from './dom.mjs';
import { S, go, st } from './state.mjs';
import { sessionTab } from './tab-memory.mjs';

const ordered = () => [...S.list].sort((a, b) => a.name.localeCompare(b.name));
function switchSession(step) {
  const list = ordered(),
    i = list.findIndex(x => x.name === st().s);
  if (list.length < 2 || i < 0) return;
  const next = list[(i + step + list.length) % list.length];
  go({ s: next.name, t: sessionTab(next.name), d: null, g: null, v: null });
  toast(`${next.name} · ${((i + step + list.length) % list.length) + 1}/${list.length}`);
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
