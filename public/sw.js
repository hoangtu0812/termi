// Push không có payload: hỏi server nội dung cảnh báo mới nhất rồi hiện thông báo
self.addEventListener('push', e => e.waitUntil((async () => {
  let a = { title: 'termi', body: 'Có cập nhật từ agent', session: '' };
  try { a = await (await fetch('/api/push/alert', { cache: 'no-store' })).json(); } catch {}
  // iOS bắt buộc mỗi push phải hiện một thông báo
  await self.registration.showNotification(a.title, { body: a.body, tag: `${a.machine || ''}/${a.session || 'termi'}`, icon: '/icon.svg', data: { s: a.session, m: a.machine } });
})()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { s, m } = e.notification.data || {};
  const url = s ? '/#' + new URLSearchParams({ s, t: 'term', ...(m ? { m } : {}) }) : '/';
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins[0]) { await wins[0].focus(); return wins[0].navigate(url); }
    return clients.openWindow(url);
  })());
});

// Không tới được máy chủ: trả trang "đang kết nối" đã lưu sẵn thay cho trang lỗi của trình duyệt.
// Chỉ áp dụng cho việc mở trang; API, terminal… luôn đi thẳng mạng, không lưu đệm.
const OFFLINE = '/offline.html';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open('termi-offline').then(c => c.add(OFFLINE)));
});
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
});
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
