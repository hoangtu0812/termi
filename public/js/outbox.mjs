import { toast } from './api.mjs';
import { $, el } from './dom.mjs';
import { store } from './storage.mjs';

const KEY = 'termi-outbox';
const MAX_ITEMS = 20;
const PREVIEW_CHARS = 40;
let flushing = false;

export function readOutbox(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.filter(x => x && typeof x.text === 'string' && x.session) : [];
  } catch {
    return [];
  }
}

const load = () => readOutbox(store.get(KEY));
const save = list => store.set(KEY, list.length ? JSON.stringify(list.slice(-MAX_ITEMS)) : null);

export const sendPath = machine => (machine ? `/m/${encodeURIComponent(machine)}` : '') + '/api/send';

async function deliver(item) {
  const r = await fetch(sendPath(item.machine), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-termi': '1' },
    body: JSON.stringify({ session: item.session, text: item.text, enter: true }),
  });
  if (!r.ok) throw Object.assign(new Error(String(r.status)), { rejected: true });
}

function renderOutbox() {
  const list = load();
  const box = $('outbox');
  box.hidden = !list.length;
  if (!list.length) return box.replaceChildren();
  const first = list[0].text.replace(/\s+/g, ' ').slice(0, PREVIEW_CHARS);
  const retry = el('button', 'btn sm', 'Gửi lại');
  const drop = el('button', 'btn sm', 'Bỏ');
  retry.type = drop.type = 'button';
  retry.onclick = () => flushOutbox();
  drop.onclick = () => {
    save([]);
    renderOutbox();
  };
  const label = el('span', 'ob-t', `${list.length} tin chưa gửi · “${first}”`);
  box.replaceChildren(el('span', 'ob-dot'), label, retry, drop);
}

export function queueMessage(machine, session, text) {
  save([...load(), { machine, session, text, at: Date.now() }]);
  renderOutbox();
  toast('Mất mạng: tin được giữ lại và sẽ tự gửi khi có mạng');
}

export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  let list = load();
  try {
    while (list.length) {
      await deliver(list[0]);
      list = list.slice(1);
      save(list);
    }
    toast('Đã gửi các tin còn chờ');
  } catch (e) {
    if (e.rejected) {
      save(list.slice(1));
      toast('Một tin chờ không gửi được (phiên đã đóng?) nên đã bỏ', true);
    }
  } finally {
    flushing = false;
    renderOutbox();
  }
}

export function setupOutbox() {
  renderOutbox();
  addEventListener('online', flushOutbox);
  addEventListener('termi:server-up', flushOutbox);
}
