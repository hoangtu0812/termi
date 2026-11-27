import { api, safely, toast } from './api.mjs';
import { $ } from './dom.mjs';

export const b64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pushState() {
  const reg = await navigator.serviceWorker?.getRegistration();
  $('b-bell').classList.toggle(
    'on',
    !!(await reg?.pushManager?.getSubscription()) && Notification.permission === 'granted',
  );
}
export const enablePush = safely(async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    throw new Error(
      'Trình duyệt chưa hỗ trợ thông báo. Trên iPhone: thêm termi vào Màn hình chính rồi mở từ bi' + 'ểu tượng đó.',
    );
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Bạn chưa cho phép thông báo');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('api/push/key');
  const subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  let sub = (await reg.pushManager.getSubscription()) || (await subscribe());
  await api('api/push/sub', sub.toJSON());
  let { results = [] } = await api('api/push/test', {});
  if (results.some(r => r.status === 404 || r.status === 410)) {
    await sub.unsubscribe().catch(() => {});
    sub = await subscribe();
    await api('api/push/sub', sub.toJSON());
    ({ results = [] } = await api('api/push/test', {}));
  }
  const bad = results.filter(r => r.status < 200 || r.status > 299);
  if (!results.length) throw new Error('Server chưa nhận được đăng ký của máy này');
  if (bad.length)
    throw new Error('Gửi thử thất bại: ' + bad.map(r => `${r.host} ${r.status || ''} ${r.detail}`).join('; '));
  toast(
    'Đã gửi thử thành công. Nếu vài giây nữa không thấy thông báo, kiểm tra quyền thông báo của' +
      ' Chrome trong Cài đặt Android.',
  );
  pushState();
});
export function setupPush() {
  navigator.serviceWorker
    ?.register('sw.js')
    .then(pushState)
    .catch(() => {});
}
