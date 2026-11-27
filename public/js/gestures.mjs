import { $, el, wide } from './dom.mjs';
import { loadChat } from './chat.mjs';
import { loadFiles } from './files.mjs';
import { loadGit } from './git.mjs';
import { icon } from './icons.mjs';
import { poll } from './poll.mjs';
import { loadProjects } from './sessions.mjs';
import { S, go, st } from './state.mjs';
import { toast } from './api.mjs';

const EDGE_WIDTH = 24;
const SWIPE_DISTANCE = 70;
const SWIPE_TOLERANCE = 60;
const PULL_DISTANCE = 80;
const PULL_DAMPING = 0.5;
const PULL_MAX_OFFSET = 50;
const PULL_REST_OFFSET = 30;
const HIDDEN_OFFSET = '-60px';
const TAP_VIBRATION_MS = 8;
const REFRESH_VIBRATION_MS = 10;

function goBack() {
  navigator.vibrate?.(TAP_VIBRATION_MS);
  if (st().v) history.back();
  else if (st().t !== 'sessions') go({ t: 'sessions', v: null });
}

function setupEdgeSwipe() {
  let startX = null;
  let startY = 0;
  $('main').addEventListener('touchstart', e => {
    const touch = e.touches[0];
    startX = !wide() && touch.clientX < EDGE_WIDTH ? touch.clientX : null;
    startY = touch.clientY;
  }, { passive: true });
  $('main').addEventListener('touchend', e => {
    if (startX === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX;
    startX = null;
    if (dx >= SWIPE_DISTANCE && Math.abs(touch.clientY - startY) <= SWIPE_TOLERANCE) goBack();
  }, { passive: true });
}

function pullIndicator() {
  const ptr = el('div');
  ptr.id = 'ptr';
  ptr.innerHTML = icon('up');
  ptr.append(el('span'));
  document.body.append(ptr);
  return ptr;
}

function showPull(ptr, dy) {
  const ready = dy > PULL_DISTANCE;
  ptr.classList.toggle('go', ready);
  ptr.lastChild.textContent = ready ? 'Thả để làm mới' : 'Kéo để làm mới';
  ptr.style.setProperty('--y', Math.min(dy * PULL_DAMPING, PULL_MAX_OFFSET) - PULL_REST_OFFSET + 'px');
  ptr.style.setProperty('--o', String(Math.min(dy / PULL_DISTANCE, 1)));
}

function hidePull(ptr) {
  ptr.style.setProperty('--o', '0');
  ptr.style.setProperty('--y', HIDDEN_OFFSET);
}

function onPull(ptr, box, refresh) {
  let startY = null;
  let dy = 0;
  box.addEventListener('touchstart', e => {
    startY = box.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    dy = 0;
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0 && box.scrollTop <= 0) showPull(ptr, dy);
    else hidePull(ptr);
  }, { passive: true });
  box.addEventListener('touchend', () => {
    if (startY !== null && dy > PULL_DISTANCE && box.scrollTop <= 0) {
      navigator.vibrate?.(REFRESH_VIBRATION_MS);
      Promise.resolve(refresh()).finally(() => toast('Đã làm mới'));
    }
    startY = null;
    hidePull(ptr);
  }, { passive: true });
}

export function setupGestures() {
  setupEdgeSwipe();
  const ptr = pullIndicator();
  onPull(ptr, $('chat-list'), () => loadChat());
  onPull(ptr, $('f-list'), () => loadFiles(S.filesDir));
  onPull(ptr, $('p-git').querySelector('.scroll'), () => loadGit(S.git?.dir));
  onPull(ptr, $('sessions'), () => Promise.all([poll(), loadProjects()]));
}
