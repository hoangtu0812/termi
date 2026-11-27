import { fail } from '../errors.mjs';

const MAX_BODY_CHARS = 64_000;
const RAW = Symbol('raw response');
const STREAMING = Symbol('streaming body');
const OWNS_RESPONSE = Symbol('owns response');

export const rawResponse = (headers, body) => ({ [RAW]: true, headers, body });

export const streamingBody = handler => Object.assign(handler, { [STREAMING]: true });

export const ownsResponse = handler => Object.assign(handler, { [OWNS_RESPONSE]: true });

export async function readJsonBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > MAX_BODY_CHARS) throw fail(413, 'Body quá lớn');
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw fail(400, 'JSON không hợp lệ');
  }
}

export function respondError(res, error) {
  if (!error.status) console.error(error);
  if (res.headersSent) return res.destroy();
  res.writeHead(error.status || 500, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: error.status ? error.message : 'Lỗi máy chủ' }));
}

export function createRouter(tables, buildId) {
  const routes = Object.assign(Object.create(null), ...tables);

  async function send(res, data) {
    if (data?.[RAW]) {
      res.writeHead(200, data.headers);
      return res.end(data.body);
    }
    res.writeHead(200, { 'content-type': 'application/json', 'x-termi-build': await buildId() });
    res.end(JSON.stringify(data));
  }

  return async function dispatch(req, res, url) {
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) throw fail(404, 'Không tìm thấy');
    if (handler[OWNS_RESPONSE]) return handler(url.searchParams, req, res);
    const body = req.method === 'POST' && !handler[STREAMING] ? await readJsonBody(req) : {};
    await send(res, await handler(url.searchParams, body, req));
  };
}
