// Push không có payload: hỏi server nội dung cảnh báo mới nhất rồi hiện thông báo
self.addEventListener('push', e => e.waitUntil((async () => {
  let a = { title: 'termi', body: 'Có cập nhật từ Claude', session: '' };
  try { a = await (await fetch('/api/push/alert', { cache: 'no-store' })).json(); } catch {}
  // iOS bắt buộc mỗi push phải hiện một thông báo
  await self.registration.showNotification(a.title, { body: a.body, tag: a.session || 'termi', icon: '/icon.svg', data: a.session });
})()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data ? `/#s=${encodeURIComponent(e.notification.data)}&t=term` : '/';
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins[0]) { await wins[0].focus(); return wins[0].navigate(url); }
    return clients.openWindow(url);
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
