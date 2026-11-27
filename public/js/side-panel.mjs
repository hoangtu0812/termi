import { $, el, wide } from './dom.mjs';
import { store } from './storage.mjs';

const WIDTH_KEY = 'termi-panel-w';
const OFF_KEY = 'termi-panel-off';
const MIN_WIDTH = 240;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 336;

export const clampWidth = width => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));

const applyWidth = width => document.documentElement.style.setProperty('--panel-w', `${width}px`);

export const panelCollapsed = () => document.body.classList.contains('panel-off');

export function togglePanel(collapse = !panelCollapsed()) {
  document.body.classList.toggle('panel-off', collapse);
  store.set(OFF_KEY, collapse ? '1' : null);
  dispatchEvent(new Event('resize'));
}

function startDrag(e) {
  if (!wide() || e.button !== 0) return;
  e.preventDefault();
  const handle = e.currentTarget;
  const left = $('sidebody').getBoundingClientRect().left;
  handle.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
  const move = event => applyWidth(clampWidth(event.clientX - left));
  const stop = () => {
    document.body.classList.remove('resizing');
    store.set(WIDTH_KEY, String(Math.round($('sidebody').getBoundingClientRect().width)));
    handle.removeEventListener('pointermove', move);
    dispatchEvent(new Event('resize'));
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', stop, { once: true });
}

export function panelKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b' || !wide()) return;
  e.preventDefault();
  e.stopPropagation();
  togglePanel();
}

export function setupSidePanel() {
  applyWidth(clampWidth(Number(store.get(WIDTH_KEY)) || DEFAULT_WIDTH));
  if (store.get(OFF_KEY)) document.body.classList.add('panel-off');
  const handle = el('div', 'sresize');
  handle.title = 'Ctrl/Cmd+B';
  handle.addEventListener('pointerdown', startDrag);
  handle.addEventListener('dblclick', () => {
    applyWidth(DEFAULT_WIDTH);
    store.set(WIDTH_KEY, null);
  });
  $('side').append(handle);
  document.addEventListener('keydown', panelKey, true);
}
