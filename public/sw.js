const OFFLINE_PAGE = '/offline.html';
const OFFLINE_CACHE = 'termi-offline';
const GATEWAY_DOWN = new Set([502, 503, 504]);
const FALLBACK_ALERT = { title: 'termi', body: 'Có cập nhật từ agent', session: '' };

async function latestAlert() {
  try {
    return await (await fetch('/api/push/alert', { cache: 'no-store' })).json();
  } catch {
    return FALLBACK_ALERT;
  }
}

async function showAlert() {
  const notice = await latestAlert();
  await self.registration.showNotification(notice.title, {
    body: notice.body,
    tag: `${notice.machine || ''}/${notice.session || 'termi'}`,
    icon: '/icon.svg',
    data: { s: notice.session, m: notice.machine },
  });
}

function sessionUrl({ s, m }) {
  if (!s) return '/';
  return '/#' + new URLSearchParams({ s, t: 'term', ...(m ? { m } : {}) });
}

async function openSession(url) {
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!windows[0]) return clients.openWindow(url);
  await windows[0].focus();
  return windows[0].navigate(url);
}

async function offlineFallback() {
  return (await caches.match(OFFLINE_PAGE)) || Response.error();
}

self.addEventListener('push', event => event.waitUntil(showAlert()));

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(openSession(sessionUrl(event.notification.data || {})));
});

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.add(OFFLINE_PAGE)));
});

async function navigate(request) {
  const response = await fetch(request).catch(() => null);
  if (!response || GATEWAY_DOWN.has(response.status)) return offlineFallback();
  return response;
}

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || event.request.destination !== 'document') return;
  event.respondWith(navigate(event.request));
});

self.addEventListener('activate', event => event.waitUntil(clients.claim()));
