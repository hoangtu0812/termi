import { fail } from '../errors.mjs';
import { vapidAuthorization } from './vapid.mjs';

const FILE = 'subs.json';
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|notify\.windows\.com|push\.services\.mozilla\.com)$/;
const GONE = new Set([404, 410]);
const MAX_DETAIL_CHARS = 300;
const MESSAGE_TTL_S = '600';

export function pushEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw fail(400, 'Endpoint không hợp lệ');
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.test(url.hostname)) throw fail(400, 'Dịch vụ push không được hỗ trợ');
  return url;
}

async function deliver(keys, subscription) {
  const host = new URL(subscription.endpoint).hostname;
  const headers = {
    TTL: MESSAGE_TTL_S,
    Urgency: 'high',
    'Content-Length': '0',
    Authorization: vapidAuthorization(keys, subscription.endpoint),
  };
  try {
    const res = await fetch(subscription.endpoint, { method: 'POST', headers });
    const detail = res.ok ? '' : (await res.text()).slice(0, MAX_DETAIL_CHARS);
    if (!res.ok) console.error('push', host, res.status, detail);
    return { host, status: res.status, detail };
  } catch (error) {
    console.error('push', host, error.message);
    return { host, status: 0, detail: error.message };
  }
}

export async function createPusher({ store, keys, now = Date.now }) {
  const saved = await store.read(FILE);
  let subscriptions = Array.isArray(saved) ? saved : [];
  let lastAlert = { title: 'termi', body: '', session: '', machine: '' };

  async function send(title, body, session, machine = '') {
    lastAlert = { title, body, session, machine, t: now() };
    const results = await Promise.all(subscriptions.map(subscription => deliver(keys, subscription)));
    const gone = new Set(subscriptions.filter((_, index) => GONE.has(results[index].status)).map(s => s.endpoint));
    if (gone.size) {
      subscriptions = subscriptions.filter(subscription => !gone.has(subscription.endpoint));
      await store.write(FILE, subscriptions);
    }
    return results;
  }

  async function subscribe(endpoint) {
    const url = pushEndpoint(endpoint);
    subscriptions = [...subscriptions.filter(subscription => subscription.endpoint !== endpoint), { endpoint }];
    await store.write(FILE, subscriptions);
    console.log('push: new subscription', url.hostname, `(total ${subscriptions.length})`);
  }

  return {
    send,
    subscribe,
    publicKey: () => keys.pub,
    lastAlert: () => lastAlert,
    hasSubscribers: () => subscriptions.length > 0,
  };
}
