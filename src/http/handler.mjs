import { fail } from '../errors.mjs';
import { matchPeer } from '../machines.mjs';
import { isTermPath, proxyPeer, proxyTtyd } from './proxy.mjs';
import { respondError } from './router.mjs';

export function createHandler({ guard, machines, statics, dispatch, ttydPort }) {
  async function handle(req, res) {
    await guard.checkRequest(req);
    const peer = matchPeer(req.url);
    if (peer) {
      const dns = await machines.peerDns(peer.id);
      if (!dns) throw fail(404, 'Không tìm thấy máy, hoặc máy đó chưa chạy termi');
      return proxyPeer(req, res, dns, peer.rest);
    }
    const url = new URL(req.url, 'http://x');
    if (isTermPath(url.pathname)) return proxyTtyd(req, res, ttydPort);
    const file = statics.lookup(req.method, url.pathname);
    if (file) return statics.serve(res, file);
    guard.checkCsrf(req);
    return dispatch(req, res, url);
  }

  return (req, res) => handle(req, res).catch(error => respondError(res, error));
}
