import { fail } from '../errors.mjs';
import { validHost } from '../validate.mjs';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isAllowed(headers, allowed) {
  const login = headers['tailscale-user-login'];
  if (!login) return LOCAL_HOST.test(headers.host || '');
  return allowed.includes(String(login).toLowerCase());
}

export const sameOrigin = headers => !headers.origin
  || headers.origin === `https://${headers.host}`
  || headers.origin === `http://${headers.host}`;

export const hasCsrfHeader = req => req.method !== 'POST' || req.headers['x-termi'] === '1';

export function createGuard(allowedUsers) {
  async function checkRequest(req) {
    if (!validHost(req.headers.host)) throw fail(421, 'Host không hợp lệ');
    if (!isAllowed(req.headers, await allowedUsers())) {
      throw fail(403, 'Tài khoản Tailscale này không được phép dùng termi trên máy này');
    }
    if (!sameOrigin(req.headers)) throw fail(403, 'Origin không hợp lệ');
  }

  function checkCsrf(req) {
    if (!hasCsrfHeader(req)) throw fail(403, 'Thiếu header X-Termi');
  }

  async function allowsUpgrade(req) {
    return validHost(req.headers.host) && sameOrigin(req.headers) && isAllowed(req.headers, await allowedUsers());
  }

  return { checkRequest, checkCsrf, allowsUpgrade };
}
