import { setServer } from './conn.mjs';
import { $ } from './dom.mjs';
import { S, st } from './state.mjs';
import { currentLang, t, translate } from './i18n.mjs';

export const base = () => (st().m ? 'm/' + encodeURIComponent(st().m) + '/' : '');
const GATEWAY_DOWN = new Set([502, 503, 504]);
const gatewayDown = r => GATEWAY_DOWN.has(r.status) && !r.headers.get('content-type')?.includes('json');
const HUB_ONLY = /^api\/(machines|events|notify|quick$|push\/)/;
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
    r = null;
  }
  if (!r || gatewayDown(r)) {
    $('netbar').hidden = false;
    setServer(false);
    throw Object.assign(new Error(t('Mất kết nối tới máy chủ')), { offline: true });
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
  const node = $('toast');
  node.textContent = translate(String(msg), currentLang());
  node.className = err ? 'err' : '';
  node.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (node.hidden = true), err ? 6000 : 2500);
}
export const safely =
  fn =>
  (...a) =>
    fn(...a).catch(e => toast(e.message, true));
export function autosize(node) {
  node.style.height = 'auto';
  node.style.height = Math.min(node.scrollHeight, 160) + 'px';
}
