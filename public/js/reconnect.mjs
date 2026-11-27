import { api } from './api.mjs';
import { $, wide } from './dom.mjs';
import { S, cur, st } from './state.mjs';
import { ensureTerm, fontSize } from './terminal.mjs';

const TAP_SLOP_PX = 8;
const LINE_HEIGHT = 1.3;
const WHEEL_STEP = 100;

function scrollWheel(w, target, point, direction) {
  target.dispatchEvent(
    new w.WheelEvent('wheel', {
      deltaY: direction * WHEEL_STEP,
      deltaMode: 0,
      clientX: point.clientX,
      clientY: point.clientY,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function createTouchScroller(w, target) {
  const swipe = { y: null, acc: 0, moved: false };
  const start = e => {
    if (e.touches.length !== 1) return;
    Object.assign(swipe, { y: e.touches[0].clientY, acc: 0, moved: false });
  };
  const move = e => {
    if (swipe.y === null || e.touches.length !== 1) return;
    const point = e.touches[0];
    const step = fontSize * LINE_HEIGHT;
    swipe.acc += swipe.y - point.clientY;
    swipe.y = point.clientY;
    if (!swipe.moved && Math.abs(swipe.acc) < TAP_SLOP_PX) return;
    swipe.moved = true;
    e.preventDefault();
    e.stopPropagation();
    while (Math.abs(swipe.acc) >= step) {
      const direction = Math.sign(swipe.acc);
      swipe.acc -= direction * step;
      scrollWheel(w, target, point, direction);
    }
  };
  const end = e => {
    if (swipe.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
    swipe.y = null;
  };
  return { start, move, end };
}

export function touchScroll(w, t) {
  const target = t.element.querySelector('.xterm-screen') || t.element;
  const options = { capture: true, passive: false };
  const scroller = createTouchScroller(w, target);
  w.document.addEventListener('touchstart', scroller.start, options);
  w.document.addEventListener('touchmove', scroller.move, options);
  w.document.addEventListener('touchend', scroller.end, options);
}
export function watchDisconnect(t) {
  const check = () => {
    const down = [...t.element.children].some(
      n => n.style?.borderRadius === '15px' && /to Reconnect|Connection Closed/.test(n.textContent),
    );
    markDown(down);
  };
  new t.element.ownerDocument.defaultView.MutationObserver(check).observe(t.element, { childList: true });
}
let retryDelay = 1000,
  retryTimer = null;
export function resetRetryDelay() {
  retryDelay = 1000;
}
export function markDown(down) {
  $('t-down').hidden = !down;
  if (down) autoReconnect();
}
function autoReconnect() {
  if (retryTimer || !S.termName || !S.list.some(x => x.name === S.termName)) return;
  if (document.visibilityState !== 'visible') return;
  $('t-down-note').textContent = `Thử lại sau ${Math.round(retryDelay / 1000)} giây · chạm để thử ngay`;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryDelay = Math.min(retryDelay * 2, 30_000);
    ensureTerm(S.termName, true);
  }, retryDelay);
}
function reconnectNow() {
  clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = 1000;
  if (S.termName) ensureTerm(S.termName, true);
}
let hiddenAt = 0;
let probing = false,
  probeOk = 0;
function probeTerm() {
  if (probing || !S.termName) return;
  probing = true;
  const name = S.termName,
    at = Date.now();
  api('/api/refresh', { session: name }).catch(() => {});
  setTimeout(() => {
    probing = false;
    if (S.termName !== name) return;
    if (S.lastData < at) reconnectNow();
    else probeOk = Date.now();
  }, 4000);
}
export function checkStale() {
  const x = cur();
  if (!x || (st().t === 'sessions' && !wide()) || S.termName !== x.name || !S.lastData || retryTimer) return;
  if (x.output * 1000 > S.lastData + 5000 && Date.now() - S.lastData > 5000 && Date.now() - probeOk > 60_000)
    probeTerm();
}
export function setupReconnect() {
  $('t-down').onclick = reconnectNow;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (!$('t-down').hidden) reconnectNow();
    else if (hiddenAt && Date.now() - hiddenAt > 10_000) probeTerm();
  });
  addEventListener('online', () => {
    if (!$('t-down').hidden) reconnectNow();
  });
}
