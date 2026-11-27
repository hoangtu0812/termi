import { validAction, validRunId } from '../ci/actions.mjs';
import { fail } from '../errors.mjs';

export function ciRoutes({ paths, ci }) {
  return {
    async 'GET /api/ci'(query) {
      const dir = await paths.need(query.get('dir'));
      return ci.list(dir, { fresh: query.get('fresh') === '1' });
    },

    async 'GET /api/ci/log'(query) {
      const dir = await paths.need(query.get('dir'));
      if (!validRunId(query.get('run'))) throw fail(400, 'Lần chạy không hợp lệ');
      return ci.log(dir, query.get('run'));
    },

    async 'POST /api/ci/action'(_, body) {
      const dir = await paths.need(body.dir);
      if (!validRunId(body.run) || !validAction(body.action)) throw fail(400, 'Thao tác không hỗ trợ');
      return ci.act(dir, String(body.run), body.action);
    },
  };
}
