import { setServer } from './conn.mjs';
import { $ } from './dom.mjs';
import { S, st } from './state.mjs';

export const base = () => (st().m ? '/m/' + encodeURIComponent(st().m) : '');
const HUB_ONLY = /^\/api\/(machines|events|notify|quick|push\/)/;
export async function api(path, body) {
  let r;
  try {
    r = await fetch(
      HUB_ONLY.test(path) ? path : base() + path,
      body
        ? {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-termi': '1' },
            body: JSON.stringify(body),
          }
        : {},
    );
  } catch {
    $('netbar').hidden = false;
    setServer(false);
    throw Object.assign(new Error('Mất kết nối tới máy chủ'), { offline: true });
  }
  $('netbar').hidden = true;
  setServer(true);
  checkBuild(r.headers.get('x-termi-build'));
  const j = await r.json().catch(() => ({ error: r.statusText }));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
let build;
const busy = () => $('text').value || $('g-msg').value || S.atts.length || document.querySelector('dialog[open]');
function checkBuild(b) {
  if (!b) return;
  build ??= b;
  if (b === build) return;
  if (document.visibilityState === 'hidden' && !busy()) return location.reload();
  $('updbar').hidden = false;
}
let toastT;
export function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = err ? 'err' : '';
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), err ? 6000 : 2500);
}
export const safely =
  fn =>
  (...a) =>
    fn(...a).catch(e => toast(e.message, true));
export function autosize(t) {
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 160) + 'px';
}
