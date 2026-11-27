import { base } from './api.mjs';
import { S } from './state.mjs';

let source = null;

export function stopLive() {
  source?.close();
  source = null;
  S.live = false;
}

export function startLive(onList) {
  stopLive();
  if (typeof EventSource !== 'function') return;
  source = new EventSource(base() + '/api/stream');
  source.addEventListener('sessions', event => {
    S.live = true;
    onList(JSON.parse(event.data));
  });
  source.onerror = () => {
    S.live = false;
  };
}
